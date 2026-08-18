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

DROP POLICY IF EXISTS "Tenant members read automation jobs" ON public.automation_jobs;
CREATE POLICY "Tenant members read automation jobs"
  ON public.automation_jobs FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP TRIGGER IF EXISTS automation_jobs_touch ON public.automation_jobs;
CREATE TRIGGER automation_jobs_touch
  BEFORE UPDATE ON public.automation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

SELECT cron.unschedule('aoos-umami-daily-observe')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aoos-umami-daily-observe');

SELECT cron.schedule(
  'aoos-umami-daily-observe',
  '45 16 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://trumove-resource-center.lovable.app/api/public/hooks/scheduler-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-AOOS-Scheduler-Token', (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aoos_scheduler_hook' LIMIT 1
      )
    ),
    body := jsonb_build_object('scheduleKey', 'umami-daily-observe'),
    timeout_milliseconds := 20000
  );
  $job$
);

SELECT cron.unschedule('aoos-propose-from-evidence')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aoos-propose-from-evidence');

SELECT cron.schedule(
  'aoos-propose-from-evidence',
  '15 17 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://trumove-resource-center.lovable.app/api/public/hooks/propose-from-evidence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-AOOS-Scheduler-Token', (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aoos_scheduler_hook' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);