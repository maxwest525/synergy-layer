-- Tenant admin check reused by the OpenAI Ads configuration policies.
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.tenant_members m
        WHERE m.tenant_id = _tenant_id AND m.user_id = auth.uid() AND m.role = 'admin'
      )
$$;

CREATE TABLE public.openai_ads_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  pixel_id text NOT NULL,
  source_project text NOT NULL,
  canonical_origin text NOT NULL,
  allowed_origins text[] NOT NULL DEFAULT '{}'::text[],
  delivery_mode text NOT NULL DEFAULT 'live',
  request_timeout_ms integer NOT NULL DEFAULT 5000,
  max_delivery_attempts integer NOT NULL DEFAULT 3,
  match_email_sha256 boolean NOT NULL DEFAULT true,
  match_external_id_sha256 boolean NOT NULL DEFAULT true,
  match_geo boolean NOT NULL DEFAULT true,
  match_ip_address boolean NOT NULL DEFAULT false,
  match_user_agent boolean NOT NULL DEFAULT true,
  secret_name text NOT NULL DEFAULT 'OPENAI_ADS_CAPI_API_KEY',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, pixel_id),
  CONSTRAINT openai_ads_connections_delivery_mode_check
    CHECK (delivery_mode IN ('disabled','validate_only','live')),
  CONSTRAINT openai_ads_connections_timeout_check
    CHECK (request_timeout_ms BETWEEN 1000 AND 30000),
  CONSTRAINT openai_ads_connections_attempts_check
    CHECK (max_delivery_attempts BETWEEN 1 AND 5)
);
GRANT SELECT, UPDATE ON public.openai_ads_connections TO authenticated;
GRANT ALL ON public.openai_ads_connections TO service_role;
ALTER TABLE public.openai_ads_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY openai_ads_connections_read ON public.openai_ads_connections
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY openai_ads_connections_update ON public.openai_ads_connections
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE TRIGGER touch_openai_ads_connections BEFORE UPDATE ON public.openai_ads_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.openai_ads_event_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  custom_event_name text,
  enabled boolean NOT NULL DEFAULT false,
  browser_enabled boolean NOT NULL DEFAULT false,
  capi_enabled boolean NOT NULL DEFAULT false,
  action_source text NOT NULL DEFAULT 'web',
  success_boundary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, event_type, custom_event_name),
  CONSTRAINT openai_ads_event_rules_type_check CHECK (event_type IN (
    'page_viewed','contents_viewed','items_added','checkout_started','order_created',
    'lead_created','registration_completed','appointment_scheduled','subscription_created',
    'trial_started','custom')),
  CONSTRAINT openai_ads_event_rules_action_source_check CHECK (action_source IN (
    'web','mobile_app','offline','physical_store','phone_call','email','other')),
  CONSTRAINT openai_ads_event_rules_custom_name_check CHECK (
    (event_type = 'custom' AND custom_event_name IS NOT NULL)
    OR (event_type <> 'custom' AND custom_event_name IS NULL))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.openai_ads_event_rules TO authenticated;
GRANT ALL ON public.openai_ads_event_rules TO service_role;
ALTER TABLE public.openai_ads_event_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY openai_ads_event_rules_read ON public.openai_ads_event_rules
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY openai_ads_event_rules_write ON public.openai_ads_event_rules
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id)) WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE TRIGGER touch_openai_ads_event_rules BEFORE UPDATE ON public.openai_ads_event_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.openai_ads_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pixel_id text NOT NULL,
  event_type text NOT NULL,
  custom_event_name text,
  event_id text NOT NULL,
  status text NOT NULL,
  validate_only boolean NOT NULL DEFAULT false,
  error_category text,
  http_status integer,
  attempt_count integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pixel_id, event_type, custom_event_name, event_id),
  CONSTRAINT openai_ads_deliveries_status_check CHECK (status IN (
    'delivered','validated','skipped','rejected','failed'))
);
GRANT SELECT ON public.openai_ads_deliveries TO authenticated;
GRANT ALL ON public.openai_ads_deliveries TO service_role;
ALTER TABLE public.openai_ads_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY openai_ads_deliveries_read ON public.openai_ads_deliveries
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE INDEX idx_openai_ads_deliveries_tenant ON public.openai_ads_deliveries(tenant_id, last_attempt_at DESC);

-- Seed the existing TruMove workspace configuration.
DO $$
DECLARE t uuid;
BEGIN
  SELECT id INTO t FROM public.tenants ORDER BY created_at LIMIT 1;
  IF t IS NULL THEN RETURN; END IF;

  INSERT INTO public.openai_ads_connections (
    tenant_id, enabled, pixel_id, source_project, canonical_origin, allowed_origins, delivery_mode
  ) VALUES (
    t, true, 'LBETxzFzJR34e6FPPhzp6S', 'TruMove Website Final', 'https://trumoveinc.com',
    ARRAY['https://trumoveinc.com','https://www.trumoveinc.com','https://trumoveinc.lovable.app'],
    'live'
  ) ON CONFLICT (tenant_id, pixel_id) DO NOTHING;

  INSERT INTO public.openai_ads_event_rules (tenant_id, event_type, enabled, browser_enabled, capi_enabled, action_source, success_boundary)
  VALUES
    (t, 'page_viewed', true, true, true, 'web', 'A page on the marketing site finished loading.'),
    (t, 'lead_created', true, true, true, 'web', 'A quote request was submitted and accepted by the site.'),
    (t, 'contents_viewed', false, false, false, 'web', ''),
    (t, 'items_added', false, false, false, 'web', ''),
    (t, 'checkout_started', false, false, false, 'web', ''),
    (t, 'order_created', false, false, false, 'web', ''),
    (t, 'registration_completed', false, false, false, 'web', ''),
    (t, 'appointment_scheduled', false, false, false, 'web', ''),
    (t, 'subscription_created', false, false, false, 'web', ''),
    (t, 'trial_started', false, false, false, 'web', '')
  ON CONFLICT (tenant_id, event_type, custom_event_name) DO NOTHING;
END $$;