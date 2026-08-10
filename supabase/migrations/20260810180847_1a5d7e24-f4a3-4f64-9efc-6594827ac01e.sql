-- DataForSEO evidence, cost accounting, and competitor discovery

CREATE TABLE public.dataforseo_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  ceiling_usd numeric(10,2) NOT NULL DEFAULT 300.00,
  spent_usd numeric(12,6) NOT NULL DEFAULT 0,
  alerts_fired jsonb NOT NULL DEFAULT '[]'::jsonb,
  hard_stop boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dataforseo_budgets TO authenticated;
GRANT ALL ON public.dataforseo_budgets TO service_role;
ALTER TABLE public.dataforseo_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY dfs_budget_read ON public.dataforseo_budgets FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY dfs_budget_write ON public.dataforseo_budgets FOR ALL USING (is_operator() AND is_tenant_member(tenant_id)) WITH CHECK (is_operator() AND is_tenant_member(tenant_id));
CREATE TRIGGER touch_dfs_budgets BEFORE UPDATE ON public.dataforseo_budgets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.dataforseo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  family text NOT NULL,
  endpoint text NOT NULL,
  mode text NOT NULL DEFAULT 'live',
  request_fingerprint text NOT NULL,
  workflow_run_id uuid REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  workflow_key text,
  provider_status_code integer,
  provider_status_message text,
  http_status integer,
  task_count integer NOT NULL DEFAULT 0,
  returned_row_count integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  duration_ms integer,
  rate_limit jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL DEFAULT 'succeeded',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dfs_requests_tenant_month ON public.dataforseo_requests (tenant_id, created_at DESC);
CREATE INDEX dfs_requests_capability ON public.dataforseo_requests (tenant_id, capability_key);
GRANT SELECT, INSERT ON public.dataforseo_requests TO authenticated;
GRANT ALL ON public.dataforseo_requests TO service_role;
ALTER TABLE public.dataforseo_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY dfs_requests_read ON public.dataforseo_requests FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY dfs_requests_write ON public.dataforseo_requests FOR INSERT WITH CHECK (is_operator() AND is_tenant_member(tenant_id));

CREATE TABLE public.dataforseo_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  family text NOT NULL,
  endpoint text NOT NULL,
  kind text NOT NULL,
  target text NOT NULL,
  mode text NOT NULL DEFAULT 'live',
  request_fingerprint text NOT NULL,
  checksum text NOT NULL,
  api_version text NOT NULL DEFAULT 'v3',
  provider_task_id text,
  provider_status_code integer,
  provider_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  request_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  returned_row_count integer NOT NULL DEFAULT 0,
  possibly_truncated boolean NOT NULL DEFAULT false,
  reporting_date date NOT NULL,
  collected_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid REFERENCES public.dataforseo_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, request_fingerprint)
);
CREATE INDEX dfs_snapshots_lookup ON public.dataforseo_snapshots (tenant_id, kind, reporting_date DESC);
GRANT SELECT, INSERT ON public.dataforseo_snapshots TO authenticated;
GRANT ALL ON public.dataforseo_snapshots TO service_role;
ALTER TABLE public.dataforseo_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY dfs_snapshots_read ON public.dataforseo_snapshots FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY dfs_snapshots_write ON public.dataforseo_snapshots FOR INSERT WITH CHECK (is_operator() AND is_tenant_member(tenant_id));

CREATE TABLE public.dataforseo_serp_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider_task_id text NOT NULL,
  tag text NOT NULL,
  endpoint text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  keyword text NOT NULL,
  location_code integer,
  language_code text,
  request_fingerprint text NOT NULL,
  request_params jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'queued',
  posted_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  snapshot_id uuid REFERENCES public.dataforseo_snapshots(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_task_id)
);
GRANT SELECT, INSERT, UPDATE ON public.dataforseo_serp_tasks TO authenticated;
GRANT ALL ON public.dataforseo_serp_tasks TO service_role;
ALTER TABLE public.dataforseo_serp_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY dfs_tasks_read ON public.dataforseo_serp_tasks FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY dfs_tasks_write ON public.dataforseo_serp_tasks FOR ALL USING (is_operator() AND is_tenant_member(tenant_id)) WITH CHECK (is_operator() AND is_tenant_member(tenant_id));

CREATE TABLE public.competitor_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  seed_domain text NOT NULL,
  domain text NOT NULL,
  source text NOT NULL,
  snapshot_id uuid REFERENCES public.dataforseo_snapshots(id) ON DELETE SET NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_state text NOT NULL DEFAULT 'discovered',
  reviewed_by uuid,
  reviewed_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, seed_domain, domain, source)
);
GRANT SELECT, INSERT, UPDATE ON public.competitor_candidates TO authenticated;
GRANT ALL ON public.competitor_candidates TO service_role;
ALTER TABLE public.competitor_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY dfs_candidates_read ON public.competitor_candidates FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY dfs_candidates_write ON public.competitor_candidates FOR ALL USING (is_operator() AND is_tenant_member(tenant_id)) WITH CHECK (is_operator() AND is_tenant_member(tenant_id));

CREATE TABLE public.tracked_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  label text,
  candidate_id uuid REFERENCES public.competitor_candidates(id) ON DELETE SET NULL,
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_competitors TO authenticated;
GRANT ALL ON public.tracked_competitors TO service_role;
ALTER TABLE public.tracked_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY dfs_tracked_read ON public.tracked_competitors FOR SELECT USING (is_tenant_member(tenant_id));
CREATE POLICY dfs_tracked_write ON public.tracked_competitors FOR ALL USING (is_operator() AND is_tenant_member(tenant_id)) WITH CHECK (is_operator() AND is_tenant_member(tenant_id));