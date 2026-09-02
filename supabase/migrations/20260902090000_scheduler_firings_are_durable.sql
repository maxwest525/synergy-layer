-- Scheduler firings are durable, and the schedule rows say when they fire.
--
-- Monitoring review 2026-09-02, MON-3 (backlog CODE-48). cron.job_run_details
-- says "succeeded, 1 row" for every firing because the job's statement is
-- net.http_post, which succeeds the moment the request is queued; the HTTP
-- outcome lands in net._http_response, which is kept for hours, not days.
-- The schedule row keeps only its last state. Nothing kept one record per
-- firing, so the days the tick answered 500 left no trace.
--
-- 1. schedule_runs: one row per claimed or blocked schedule per tick, written
--    by the tick itself (scheduler.server.ts) and, when the tick throws before
--    claiming anything, by the hook that received the firing.
-- 2. Two schedule rows disagreed with the cron entries that actually fire
--    them by five minutes (gsc 16:00 against 16:05, ga4 16:30 against 16:35).
--    The cron entry is the one that fires, so the row now says the same.
-- Rollback: DROP TABLE public.schedule_runs; restore the two cron strings.

CREATE TABLE IF NOT EXISTS public.schedule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  schedule_key text NOT NULL,
  fired_by text NOT NULL CHECK (fired_by IN ('pg_cron', 'operator')),
  state text NOT NULL CHECK (state IN ('succeeded', 'failed', 'blocked')),
  fired_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_runs_schedule_fired_idx
  ON public.schedule_runs (schedule_id, fired_at DESC);

REVOKE ALL ON public.schedule_runs FROM anon;
GRANT SELECT, INSERT ON public.schedule_runs TO authenticated;
GRANT ALL ON public.schedule_runs TO service_role;

ALTER TABLE public.schedule_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedule_runs_read ON public.schedule_runs;
CREATE POLICY schedule_runs_read ON public.schedule_runs
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- The operator's own "run now" writes through the session client; every
-- other writer is the service role. A row is written once and never changed.
DROP POLICY IF EXISTS schedule_runs_insert ON public.schedule_runs;
CREATE POLICY schedule_runs_insert ON public.schedule_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_operator()
    AND tenant_id IS NOT NULL
    AND public.is_tenant_member(tenant_id)
  );

UPDATE public.schedules SET cron = '5 16 * * *'
 WHERE key = 'gsc-daily-observe' AND cron = '0 16 * * *';
UPDATE public.schedules SET cron = '35 16 * * *'
 WHERE key = 'ga4-daily-observe' AND cron = '30 16 * * *';
