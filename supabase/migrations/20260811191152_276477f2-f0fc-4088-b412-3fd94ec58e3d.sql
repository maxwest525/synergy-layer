CREATE TABLE public.measurement_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('pagespeed','ga4')),
  target text NOT NULL,
  strategy text,
  actor_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','partial')),
  error text,
  http_status integer,
  cost_usd numeric NOT NULL DEFAULT 0,
  quota jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX measurement_runs_tenant_provider_idx ON public.measurement_runs (tenant_id, provider, started_at DESC);

CREATE TABLE public.pagespeed_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.measurement_runs(id) ON DELETE CASCADE,
  url text NOT NULL,
  final_url text,
  strategy text NOT NULL,
  lighthouse_version text,
  analysis_timestamp timestamptz,
  performance_score integer,
  seo_score integer,
  lcp_ms numeric,
  cls numeric,
  tbt_ms numeric,
  fcp_ms numeric,
  speed_index_ms numeric,
  opportunities jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pagespeed_snapshots_tenant_idx ON public.pagespeed_snapshots (tenant_id, collected_at DESC);

CREATE TABLE public.ga4_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.measurement_runs(id) ON DELETE CASCADE,
  property text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  quota jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ga4_snapshots_tenant_idx ON public.ga4_snapshots (tenant_id, collected_at DESC);

GRANT SELECT ON public.measurement_runs TO authenticated;
GRANT SELECT ON public.pagespeed_snapshots TO authenticated;
GRANT SELECT ON public.ga4_snapshots TO authenticated;
GRANT ALL ON public.measurement_runs TO service_role;
GRANT ALL ON public.pagespeed_snapshots TO service_role;
GRANT ALL ON public.ga4_snapshots TO service_role;

ALTER TABLE public.measurement_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagespeed_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ga4_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read measurement runs" ON public.measurement_runs
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members read pagespeed snapshots" ON public.pagespeed_snapshots
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members read ga4 snapshots" ON public.ga4_snapshots
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));