-- ============ PREFLIGHT AUDIT ============
DO $$
DECLARE dupes integer;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(btrim(email)) AS e, count(*) c
    FROM auth.users WHERE email IS NOT NULL
    GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'Preflight failed: % duplicate normalized emails in auth.users. Resolve before applying uniqueness.', dupes;
  END IF;
END $$;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public.normalize_email(_email text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(btrim(_email)) $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  email_normalized text,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- backfill any existing users, then apply uniqueness
INSERT INTO public.profiles (id, email, email_normalized, display_name)
SELECT u.id, u.email, public.normalize_email(u.email), coalesce(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

CREATE UNIQUE INDEX profiles_email_normalized_key
  ON public.profiles (email_normalized) WHERE email_normalized IS NOT NULL;

-- ============ AUTHORIZED OPERATORS ============
CREATE TABLE public.authorized_operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'operator',
  note text,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.authorized_operators TO authenticated;
GRANT ALL ON public.authorized_operators TO service_role;
ALTER TABLE public.authorized_operators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authorized_operators_admin_read" ON public.authorized_operators FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_authorized_operators BEFORE UPDATE ON public.authorized_operators
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.authorized_operators (email_normalized, role, note)
VALUES (public.normalize_email('Admin@trumoveinc.com'), 'admin', 'Seeded founding administrator.')
ON CONFLICT (email_normalized) DO NOTHING;

-- ============ LAST ADMIN GUARD ============
CREATE OR REPLACE FUNCTION public.assert_admin_remains(_excluding_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining integer;
BEGIN
  SELECT count(*) INTO remaining FROM public.user_roles
  WHERE role = 'admin' AND (_excluding_user IS NULL OR user_id <> _excluding_user);
  IF remaining < 1 THEN
    RAISE EXCEPTION 'AOOS must keep at least one active administrator. Grant a second admin before removing this one.';
  END IF;
END $$;

-- ============ PROVISIONING ============
CREATE OR REPLACE FUNCTION public.provision_operator_from_allowlist(_auth_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_verified timestamptz;
  v_norm text;
  v_allow public.app_role;
  v_current public.app_role;
  rank_new integer;
  rank_cur integer;
BEGIN
  SELECT email, email_confirmed_at INTO v_email, v_verified FROM auth.users WHERE id = _auth_user_id;
  IF v_email IS NULL THEN RETURN 'unknown_user'; END IF;

  v_norm := public.normalize_email(v_email);

  INSERT INTO public.profiles (id, email, email_normalized)
  VALUES (_auth_user_id, v_email, v_norm)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, email_normalized = EXCLUDED.email_normalized;

  IF v_verified IS NULL THEN
    INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
    VALUES ('system', _auth_user_id::text, 'auth.provision_skipped', 'user', _auth_user_id,
            'Provisioning skipped: email is not verified.', jsonb_build_object('reason','unverified_email'));
    RETURN 'unverified';
  END IF;

  SELECT role INTO v_allow FROM public.authorized_operators
  WHERE email_normalized = v_norm AND revoked_at IS NULL;

  IF v_allow IS NULL THEN
    INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
    VALUES ('system', _auth_user_id::text, 'auth.access_denied', 'user', _auth_user_id,
            'Sign-in succeeded but the account is not on the operator allowlist.',
            jsonb_build_object('reason','not_allowlisted'));
    RETURN 'not_allowlisted';
  END IF;

  SELECT role INTO v_current FROM public.user_roles WHERE user_id = _auth_user_id
  ORDER BY CASE role WHEN 'admin' THEN 3 WHEN 'operator' THEN 2 ELSE 1 END DESC LIMIT 1;

  rank_new := CASE v_allow WHEN 'admin' THEN 3 WHEN 'operator' THEN 2 ELSE 1 END;
  rank_cur := CASE v_current WHEN 'admin' THEN 3 WHEN 'operator' THEN 2 ELSE 1 END;

  IF v_current IS NOT NULL AND rank_cur >= rank_new THEN
    RETURN 'unchanged';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _auth_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_auth_user_id, v_allow)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
  VALUES ('system', _auth_user_id::text, 'auth.operator_provisioned', 'user', _auth_user_id,
          format('Operator access provisioned as %s.', v_allow),
          jsonb_build_object('role', v_allow));

  RETURN 'provisioned:' || v_allow::text;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_operator(_email text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_norm text;
  v_user uuid;
  v_role public.app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required to revoke operator access.';
  END IF;

  v_norm := public.normalize_email(_email);
  SELECT id INTO v_user FROM auth.users WHERE public.normalize_email(email) = v_norm;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_user AND role = 'admin';

  IF v_role = 'admin' THEN
    PERFORM public.assert_admin_remains(v_user);
  END IF;

  UPDATE public.authorized_operators SET revoked_at = now() WHERE email_normalized = v_norm AND revoked_at IS NULL;
  IF v_user IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_user;
  END IF;

  INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
  VALUES ('user', auth.uid()::text, 'auth.operator_revoked', 'user', v_user,
          format('Operator access revoked for %s.', v_norm), jsonb_build_object('email_normalized', v_norm));

  RETURN 'revoked';
END $$;

-- ============ NEW USER TRIGGER (replaces first-user-becomes-admin) ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, email_normalized, display_name, avatar_url)
  VALUES (NEW.id, NEW.email, public.normalize_email(NEW.email),
          coalesce(NEW.raw_user_meta_data->>'full_name', NEW.email),
          NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.provision_operator_from_allowlist(NEW.id);
  RETURN NEW;
END $$;

-- ============ SEARCH CONSOLE ============
CREATE TABLE public.search_console_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url text NOT NULL UNIQUE,
  permission_level text NOT NULL,
  eligible boolean NOT NULL DEFAULT false,
  selected boolean NOT NULL DEFAULT false,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  last_observed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.search_console_properties TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_console_properties TO authenticated;
GRANT ALL ON public.search_console_properties TO service_role;
ALTER TABLE public.search_console_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scp_read" ON public.search_console_properties FOR SELECT USING (true);
CREATE POLICY "scp_write" ON public.search_console_properties FOR ALL TO authenticated
  USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE TRIGGER touch_scp BEFORE UPDATE ON public.search_console_properties
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.search_console_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property text NOT NULL,
  kind text NOT NULL,
  search_type text NOT NULL DEFAULT 'web',
  dimensions text[] NOT NULL DEFAULT '{}',
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  aggregation_type text NOT NULL DEFAULT 'auto',
  response_aggregation_type text,
  data_state text NOT NULL DEFAULT 'final',
  row_limit integer NOT NULL DEFAULT 25000,
  paginated_request_count integer NOT NULL DEFAULT 1,
  returned_row_count integer NOT NULL DEFAULT 0,
  possibly_truncated boolean NOT NULL DEFAULT false,
  reporting_timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  period_start_pt date NOT NULL,
  period_end_pt date NOT NULL,
  api_query_version text NOT NULL DEFAULT 'webmasters/v3',
  checksum text NOT NULL,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.search_console_snapshots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_console_snapshots TO authenticated;
GRANT ALL ON public.search_console_snapshots TO service_role;
ALTER TABLE public.search_console_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scs_read" ON public.search_console_snapshots FOR SELECT USING (true);
CREATE POLICY "scs_write" ON public.search_console_snapshots FOR ALL TO authenticated
  USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE TRIGGER touch_scs BEFORE UPDATE ON public.search_console_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX scs_property_period_idx ON public.search_console_snapshots (property, period_end_pt DESC);

CREATE TABLE public.search_console_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.search_console_snapshots(id) ON DELETE CASCADE,
  recommendation_id uuid REFERENCES public.recommendations(id) ON DELETE SET NULL,
  rule text NOT NULL,
  property text NOT NULL,
  target text NOT NULL,
  issue_fingerprint text NOT NULL,
  observation_fingerprint text NOT NULL UNIQUE,
  period_start_pt date NOT NULL,
  period_end_pt date NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.search_console_observations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_console_observations TO authenticated;
GRANT ALL ON public.search_console_observations TO service_role;
ALTER TABLE public.search_console_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sco_read" ON public.search_console_observations FOR SELECT USING (true);
CREATE POLICY "sco_write" ON public.search_console_observations FOR ALL TO authenticated
  USING (public.is_operator()) WITH CHECK (public.is_operator());
CREATE INDEX sco_issue_idx ON public.search_console_observations (issue_fingerprint, period_end_pt DESC);

-- recommendation dedup keys
ALTER TABLE public.recommendations ADD COLUMN IF NOT EXISTS issue_fingerprint text;
CREATE UNIQUE INDEX recommendations_open_issue_key ON public.recommendations (issue_fingerprint)
  WHERE issue_fingerprint IS NOT NULL
    AND state NOT IN ('applied','verified','rejected','rolled_back');