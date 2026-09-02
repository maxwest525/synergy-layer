-- Catches up version control with a table that already exists live: an
-- earlier session created google_ads_snapshots directly against the database
-- without a migration file, the same kind of drift CODE-9 found elsewhere.
-- Schema captured from the live table on 2026-08-31; IF NOT EXISTS so this is
-- a no-op there and a real create on any fresh environment.
--
-- One row per campaign per day (not one blob per run, unlike ga4_snapshots):
-- Google Ads attributes conversions for several days after the click, so a
-- day's totals can legitimately change on a later read, and the app code
-- upserts on (tenant, customer, campaign, day) rather than inserting a new
-- row every time.
CREATE TABLE IF NOT EXISTS public.google_ads_snapshots (
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
  conversions numeric NOT NULL DEFAULT 0,
  conversions_value numeric NOT NULL DEFAULT 0,
  collected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_ads_snapshots_unique_day UNIQUE (tenant_id, customer_id, campaign_id, segment_date)
);
CREATE INDEX IF NOT EXISTS google_ads_snapshots_lookup ON public.google_ads_snapshots (tenant_id, segment_date DESC);

ALTER TABLE public.google_ads_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_ads_snapshots_read ON public.google_ads_snapshots;
CREATE POLICY google_ads_snapshots_read ON public.google_ads_snapshots
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS google_ads_snapshots_write ON public.google_ads_snapshots;
CREATE POLICY google_ads_snapshots_write ON public.google_ads_snapshots
  FOR ALL TO authenticated USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
