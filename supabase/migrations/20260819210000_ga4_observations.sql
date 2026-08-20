-- GA4 rule findings, mirroring search_console_observations: one row per
-- (rule, target, anchor snapshot), deduplicated by observation_fingerprint.
-- Period columns are plain UTC dates because GA4 windows are UTC (ga4Window),
-- unlike the Pacific-dated Search Console columns. The fingerprint already
-- contains the snapshot uuid, so a single-column UNIQUE is collision-safe and
-- matches the onConflict the server module uses.
CREATE TABLE public.ga4_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.ga4_snapshots(id) ON DELETE CASCADE,
  recommendation_id uuid REFERENCES public.recommendations(id) ON DELETE SET NULL,
  rule text NOT NULL,
  property text NOT NULL,
  target text NOT NULL,
  issue_fingerprint text NOT NULL,
  observation_fingerprint text NOT NULL UNIQUE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ga4_observations TO authenticated;
GRANT ALL ON public.ga4_observations TO service_role;
ALTER TABLE public.ga4_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ga4o_read ON public.ga4_observations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY ga4o_write ON public.ga4_observations FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE INDEX ga4o_issue_idx ON public.ga4_observations (issue_fingerprint, period_end DESC);
CREATE INDEX idx_ga4o_tenant ON public.ga4_observations (tenant_id);
