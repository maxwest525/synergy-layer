ALTER TABLE public.essential_concerns
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS target_date date;

CREATE TABLE IF NOT EXISTS public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  paused_at timestamptz,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_state text,
  last_error text,
  last_created_count integer NOT NULL DEFAULT 0,
  run_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

GRANT SELECT ON public.automation_jobs TO authenticated;
GRANT ALL ON public.automation_jobs TO service_role;

ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read automation jobs"
  ON public.automation_jobs FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP TRIGGER IF EXISTS automation_jobs_touch ON public.automation_jobs;
CREATE TRIGGER automation_jobs_touch
  BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.schedules (tenant_id, key, name, cron, enabled, target_kind, target_id, health)
SELECT t.id, 'umami-daily-observe', 'Umami daily observation', '45 16 * * *', true, 'workflow', w.id, 'unknown'
FROM public.tenants t
CROSS JOIN public.workflows w
WHERE w.key = 'umami-daily-observe'
  AND NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.key = 'umami-daily-observe');
