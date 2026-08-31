CREATE TABLE public.google_ads_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  segment_date date NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  campaign_status text NOT NULL,
  advertising_channel_type text,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  cost_micros bigint NOT NULL DEFAULT 0,
  conversions numeric(14,4) NOT NULL DEFAULT 0,
  conversions_value numeric(14,4) NOT NULL DEFAULT 0,
  collected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_ads_snapshots_unique_day UNIQUE (tenant_id, customer_id, campaign_id, segment_date)
);

CREATE INDEX google_ads_snapshots_lookup ON public.google_ads_snapshots (tenant_id, segment_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_ads_snapshots TO authenticated;
GRANT ALL ON public.google_ads_snapshots TO service_role;

ALTER TABLE public.google_ads_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_ads_snapshots_read ON public.google_ads_snapshots
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY google_ads_snapshots_write ON public.google_ads_snapshots
  FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));