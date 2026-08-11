-- ============================================================
-- 1. Vendor <-> advertiser junction (many-to-many, tenant aware)
-- ============================================================
CREATE TABLE public.ad_vendor_advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  watchlist_id uuid NOT NULL REFERENCES public.ad_vendor_watchlist(id) ON DELETE CASCADE,
  advertiser_fk uuid NOT NULL REFERENCES public.ad_advertisers(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.ad_advertiser_candidates(id) ON DELETE SET NULL,
  linked_by uuid,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, watchlist_id, advertiser_fk)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_vendor_advertisers TO authenticated;
GRANT ALL ON public.ad_vendor_advertisers TO service_role;
ALTER TABLE public.ad_vendor_advertisers ENABLE ROW LEVEL SECURITY;

CREATE INDEX ad_vendor_advertisers_tenant_idx ON public.ad_vendor_advertisers (tenant_id, watchlist_id);

-- ============================================================
-- 2. Append-only SerpApi provider request ledger
--    Never stores the API key. Sanitized fingerprint/query/url only.
-- ============================================================
CREATE TABLE public.serpapi_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module text NOT NULL,
  run_key text NOT NULL,
  engine text NOT NULL,
  request_fingerprint text NOT NULL,
  query_text text,
  source_url text,
  provider_search_id text,
  provider_status text,
  state text NOT NULL DEFAULT 'reserved',
  reserved_credits integer NOT NULL DEFAULT 0,
  charged_credits integer NOT NULL DEFAULT 0,
  account_searches_left_before integer,
  account_searches_left_after integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT serpapi_requests_state_check CHECK (state IN ('reserved','succeeded','failed')),
  CONSTRAINT serpapi_requests_credits_check CHECK (reserved_credits >= 0 AND charged_credits >= 0),
  CONSTRAINT serpapi_requests_run_key_unique UNIQUE (tenant_id, run_key)
);

-- Authenticated clients may read and append. No UPDATE/DELETE grant at all:
-- the ledger is immutable to the app. Backend settlement uses service_role.
GRANT SELECT, INSERT ON public.serpapi_requests TO authenticated;
GRANT ALL ON public.serpapi_requests TO service_role;
ALTER TABLE public.serpapi_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX serpapi_requests_tenant_started_idx ON public.serpapi_requests (tenant_id, started_at DESC);

-- ============================================================
-- 3. Candidate <-> watchlist relationship and state constraints
-- ============================================================
ALTER TABLE public.ad_advertiser_candidates
  ADD COLUMN watchlist_id uuid REFERENCES public.ad_vendor_watchlist(id) ON DELETE SET NULL;

ALTER TABLE public.ad_advertiser_candidates
  ADD CONSTRAINT ad_advertiser_candidates_review_state_check
  CHECK (review_state IN ('pending','confirmed','rejected'));

ALTER TABLE public.ad_advertiser_candidates
  ADD CONSTRAINT ad_advertiser_candidates_confidence_check
  CHECK (match_confidence IS NULL OR (match_confidence >= 0 AND match_confidence <= 1));

ALTER TABLE public.ad_vendor_watchlist
  ADD CONSTRAINT ad_vendor_watchlist_resolution_state_check
  CHECK (resolution_state IN ('unresolved','pending_review','resolved','ambiguous','no_advertiser_found','rejected'));

-- ============================================================
-- 4. Replace every permissive "tenant members manage ad_*" ALL policy
-- ============================================================
DROP POLICY IF EXISTS "Tenant members manage ad advertiser candidates" ON public.ad_advertiser_candidates;
DROP POLICY IF EXISTS "Tenant members manage ad advertisers" ON public.ad_advertisers;
DROP POLICY IF EXISTS "Tenant members manage ad vendor watchlist" ON public.ad_vendor_watchlist;
DROP POLICY IF EXISTS "Tenant members manage ad creatives" ON public.ad_creatives;
DROP POLICY IF EXISTS "Tenant members manage ad creative families" ON public.ad_creative_families;
DROP POLICY IF EXISTS "Tenant members manage ad destination pages" ON public.ad_destination_pages;
DROP POLICY IF EXISTS "Tenant members manage ad live serp observations" ON public.ad_live_serp_observations;

-- --- Review/config rows: read = tenant member, mutate = operator in tenant ---
CREATE POLICY "Operators insert ad vendor watchlist" ON public.ad_vendor_watchlist
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE POLICY "Operators update ad vendor watchlist" ON public.ad_vendor_watchlist
  FOR UPDATE TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE POLICY "Operators delete ad vendor watchlist" ON public.ad_vendor_watchlist
  FOR DELETE TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id));

CREATE POLICY "Operators insert ad advertiser candidates" ON public.ad_advertiser_candidates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE POLICY "Operators update ad advertiser candidates" ON public.ad_advertiser_candidates
  FOR UPDATE TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

CREATE POLICY "Operators insert ad advertisers" ON public.ad_advertisers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE POLICY "Operators update ad advertisers" ON public.ad_advertisers
  FOR UPDATE TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant members read vendor advertiser links" ON public.ad_vendor_advertisers
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Operators insert vendor advertiser links" ON public.ad_vendor_advertisers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE POLICY "Operators delete vendor advertiser links" ON public.ad_vendor_advertisers
  FOR DELETE TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id));

-- --- Evidence + ledger rows: read = tenant member, append = operator, never mutable ---
CREATE POLICY "Operators append ad creatives" ON public.ad_creatives
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE POLICY "Operators append ad creative families" ON public.ad_creative_families
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE POLICY "Operators append ad destination pages" ON public.ad_destination_pages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE POLICY "Operators append ad live serp observations" ON public.ad_live_serp_observations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant members read serpapi requests" ON public.serpapi_requests
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Operators append serpapi requests" ON public.serpapi_requests
  FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

-- Remove any lingering table-level mutation privilege on append-only evidence.
REVOKE UPDATE, DELETE ON public.ad_creatives FROM authenticated;
REVOKE UPDATE, DELETE ON public.ad_creative_families FROM authenticated;
REVOKE UPDATE, DELETE ON public.ad_destination_pages FROM authenticated;
REVOKE UPDATE, DELETE ON public.ad_live_serp_observations FROM authenticated;

-- ============================================================
-- 5. Atomic operator decision RPC (SECURITY INVOKER: RLS still applies)
-- ============================================================
CREATE OR REPLACE FUNCTION public.decide_ad_advertiser_candidate(
  _candidate_id uuid,
  _decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_cand public.ad_advertiser_candidates%ROWTYPE;
  v_watchlist_id uuid;
  v_advertiser_fk uuid;
  v_pending integer;
  v_state text;
BEGIN
  IF _decision NOT IN ('confirm','reject') THEN
    RAISE EXCEPTION 'Decision must be confirm or reject.';
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in as an operator to decide advertiser candidates.';
  END IF;
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Operator or admin role required to decide advertiser candidates.';
  END IF;

  SELECT * INTO v_cand FROM public.ad_advertiser_candidates WHERE id = _candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That advertiser candidate is not visible to this account.';
  END IF;
  IF NOT public.is_tenant_member(v_cand.tenant_id) THEN
    RAISE EXCEPTION 'That advertiser candidate belongs to another client workspace.';
  END IF;
  IF v_cand.review_state <> 'pending' THEN
    RAISE EXCEPTION 'That advertiser candidate was already %.', v_cand.review_state;
  END IF;

  v_state := CASE WHEN _decision = 'confirm' THEN 'confirmed' ELSE 'rejected' END;

  UPDATE public.ad_advertiser_candidates
     SET review_state = v_state, reviewed_by = v_uid, reviewed_at = v_now
   WHERE id = _candidate_id AND review_state = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That advertiser candidate changed while you were reviewing it. Refresh and try again.';
  END IF;

  v_watchlist_id := v_cand.watchlist_id;
  IF v_watchlist_id IS NULL THEN
    SELECT id INTO v_watchlist_id FROM public.ad_vendor_watchlist
     WHERE tenant_id = v_cand.tenant_id AND domain = v_cand.query_text;
  END IF;

  IF _decision = 'confirm' THEN
    INSERT INTO public.ad_advertisers (
      tenant_id, advertiser_id, advertiser_name, ad_funded_by, vendor_domain,
      is_verified, confirmed_by, confirmed_at, source_url
    ) VALUES (
      v_cand.tenant_id, v_cand.advertiser_id, v_cand.advertiser_name, v_cand.ad_funded_by,
      v_cand.query_text, true, v_uid, v_now, v_cand.source_url
    )
    ON CONFLICT (tenant_id, advertiser_id) DO UPDATE
      SET advertiser_name = COALESCE(EXCLUDED.advertiser_name, public.ad_advertisers.advertiser_name),
          ad_funded_by   = COALESCE(EXCLUDED.ad_funded_by, public.ad_advertisers.ad_funded_by),
          is_verified    = true,
          confirmed_by   = v_uid,
          confirmed_at   = v_now,
          source_url     = COALESCE(EXCLUDED.source_url, public.ad_advertisers.source_url)
    RETURNING id INTO v_advertiser_fk;

    -- A vendor may run several advertiser accounts, so this is a link, not an overwrite.
    IF v_watchlist_id IS NOT NULL THEN
      INSERT INTO public.ad_vendor_advertisers (tenant_id, watchlist_id, advertiser_fk, candidate_id, linked_by, linked_at)
      VALUES (v_cand.tenant_id, v_watchlist_id, v_advertiser_fk, _candidate_id, v_uid, v_now)
      ON CONFLICT (tenant_id, watchlist_id, advertiser_fk) DO NOTHING;
    END IF;
  END IF;

  -- Watchlist state follows the remaining queue for that vendor domain.
  IF v_watchlist_id IS NOT NULL THEN
    SELECT count(*) INTO v_pending FROM public.ad_advertiser_candidates
     WHERE tenant_id = v_cand.tenant_id AND query_text = v_cand.query_text AND review_state = 'pending';

    UPDATE public.ad_vendor_watchlist
       SET resolution_state = CASE
             WHEN v_pending > 0 THEN 'pending_review'
             WHEN EXISTS (SELECT 1 FROM public.ad_vendor_advertisers l
                           WHERE l.tenant_id = v_cand.tenant_id AND l.watchlist_id = v_watchlist_id)
               THEN 'resolved'
             ELSE 'rejected'
           END
     WHERE id = v_watchlist_id;
  END IF;

  SELECT count(*) INTO v_pending FROM public.ad_advertiser_candidates
   WHERE tenant_id = v_cand.tenant_id AND review_state = 'pending';

  RETURN jsonb_build_object(
    'candidateId', _candidate_id,
    'reviewState', v_state,
    'advertiserFk', v_advertiser_fk,
    'watchlistId', v_watchlist_id,
    'pendingRemaining', v_pending
  );
END
$function$;

REVOKE ALL ON FUNCTION public.decide_ad_advertiser_candidate(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_ad_advertiser_candidate(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.decide_ad_advertiser_candidate(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_ad_advertiser_candidate(uuid, text) TO service_role;