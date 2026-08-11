ALTER TABLE public.change_requests
  ADD COLUMN IF NOT EXISTS source_repo text,
  ADD COLUMN IF NOT EXISTS source_branch text,
  ADD COLUMN IF NOT EXISTS source_commit_sha text,
  ADD COLUMN IF NOT EXISTS source_commit_url text,
  ADD COLUMN IF NOT EXISTS source_committed_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_proof_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_proof_notes text;

CREATE TABLE IF NOT EXISTS public.change_request_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_request_id uuid NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  actor_id uuid,
  kind text NOT NULL,
  status text NOT NULL,
  commit_sha text,
  commit_url text,
  error text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS change_request_executions_request_idx
  ON public.change_request_executions (change_request_id, created_at DESC);

GRANT SELECT ON public.change_request_executions TO authenticated;
GRANT ALL ON public.change_request_executions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.change_request_executions FROM authenticated;
REVOKE ALL ON public.change_request_executions FROM anon;

ALTER TABLE public.change_request_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read change request executions" ON public.change_request_executions;
CREATE POLICY "Tenant members read change request executions"
  ON public.change_request_executions FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

UPDATE public.change_requests
SET source_repo = 'maxwest525/brittmove-829a7519',
    source_branch = 'main',
    source_project_id = COALESCE(source_project_id, '3c0c30e5-798a-425c-b077-6d5e8cb04e5b')
WHERE id = '55b3fc0e-e4cd-4e29-9bf0-af21d2b5b12f';