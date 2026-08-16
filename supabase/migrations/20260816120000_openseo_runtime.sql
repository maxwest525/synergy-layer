CREATE TABLE IF NOT EXISTS public.openseo_tool_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL,
  tool_name text NOT NULL,
  classification text NOT NULL
    CHECK (classification IN ('free_read','metered_read','mutation','destructive')),
  cost_model text NOT NULL CHECK (cost_model IN ('free','metered','unknown')),
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('succeeded','failed')),
  error_code text,
  source_endpoint text NOT NULL,
  openseo_version text NOT NULL,
  mcp_version text NOT NULL,
  credits_charged numeric CHECK (credits_charged IS NULL OR credits_charged >= 0),
  credits_remaining numeric,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS openseo_tool_runs_tenant_created
  ON public.openseo_tool_runs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS openseo_tool_runs_tenant_tool
  ON public.openseo_tool_runs (tenant_id, tool_name, created_at DESC);

CREATE OR REPLACE FUNCTION public.reject_openseo_tool_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'OpenSEO invocation history is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS protect_openseo_tool_runs ON public.openseo_tool_runs;
CREATE TRIGGER protect_openseo_tool_runs
  BEFORE UPDATE OR DELETE ON public.openseo_tool_runs
  FOR EACH ROW EXECUTE FUNCTION public.reject_openseo_tool_run_mutation();

ALTER TABLE public.openseo_tool_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS openseo_tool_runs_read ON public.openseo_tool_runs;
CREATE POLICY openseo_tool_runs_read ON public.openseo_tool_runs
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

REVOKE ALL ON public.openseo_tool_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.openseo_tool_runs TO authenticated;
GRANT ALL ON public.openseo_tool_runs TO service_role;
