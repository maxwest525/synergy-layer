CREATE TABLE IF NOT EXISTS public.seo_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_url text NOT NULL,
  query_class text NOT NULL
    CHECK (query_class IN ('community','local_service','professional_b2b','ymyl','general')),
  change_type text NOT NULL DEFAULT 'title_h1' CHECK (change_type IN ('title_h1')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN (
    'draft','preflight_blocked','evidence_ready','evaluated','awaiting_approval',
    'approved','executing','executed','verified','rejected','failed','rolled_back'
  )),
  connector_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  knowledge_chunk_ids uuid[] NOT NULL DEFAULT '{}',
  authority_finding_ids uuid[] NOT NULL DEFAULT '{}',
  change_request_id uuid REFERENCES public.change_requests(id) ON DELETE SET NULL,
  idempotency_key uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS public.seo_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  event_key text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'draft','preflight_blocked','evidence_ready','evaluated','awaiting_approval',
    'approved','executing','executed','verified','rejected','failed','rolled_back'
  )),
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_id, event_key),
  FOREIGN KEY (run_id, tenant_id) REFERENCES public.seo_runs(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS seo_runs_state_created ON public.seo_runs(tenant_id, state, created_at DESC);
CREATE INDEX IF NOT EXISTS seo_run_events_timeline ON public.seo_run_events(tenant_id, run_id, occurred_at, id);
DROP TRIGGER IF EXISTS touch_seo_runs ON public.seo_runs;
CREATE TRIGGER touch_seo_runs BEFORE UPDATE ON public.seo_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.reject_seo_run_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'SEO run events are append-only.';
END;
$$;

DROP TRIGGER IF EXISTS protect_seo_run_events ON public.seo_run_events;
CREATE TRIGGER protect_seo_run_events
  BEFORE UPDATE OR DELETE ON public.seo_run_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_seo_run_event_mutation();

ALTER TABLE public.seo_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seo_runs_read ON public.seo_runs;
CREATE POLICY seo_runs_read ON public.seo_runs
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS seo_run_events_read ON public.seo_run_events;
CREATE POLICY seo_run_events_read ON public.seo_run_events
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

REVOKE ALL ON public.seo_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.seo_run_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seo_runs TO authenticated;
GRANT SELECT ON public.seo_run_events TO authenticated;
GRANT ALL ON public.seo_runs TO service_role;
GRANT ALL ON public.seo_run_events TO service_role;

CREATE OR REPLACE FUNCTION public.sync_seo_run_change_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  run_state text;
BEGIN
  run_state := CASE NEW.state
    WHEN 'proposed' THEN 'awaiting_approval'
    WHEN 'approved' THEN 'approved'
    WHEN 'applied' THEN 'executed'
    WHEN 'verified' THEN 'verified'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'rolled_back' THEN 'rolled_back'
    ELSE NULL
  END;
  IF run_state IS NOT NULL THEN
    UPDATE public.seo_runs
    SET state = run_state,
        completed_at = CASE WHEN run_state IN ('verified','rejected','rolled_back') THEN now() ELSE completed_at END
    WHERE tenant_id = NEW.tenant_id AND change_request_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_seo_run_from_change_request ON public.change_requests;
CREATE TRIGGER sync_seo_run_from_change_request
  AFTER UPDATE OF state ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_seo_run_change_state();
