-- Run the existing free GSC observation workflow every day without exposing a
-- public project key or waking any paid-provider schedules.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $secret$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM vault.secrets
     WHERE name = 'aoos_scheduler_hook'
  ) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'aoos_scheduler_hook',
      'Authenticates the GSC-only AOOS cron hook.'
    );
  END IF;
END
$secret$;

CREATE OR REPLACE FUNCTION public.verify_scheduler_hook_token(_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions', 'pg_temp'
AS $verify$
  SELECT COALESCE(
    length(_token) > 0
    AND EXISTS (
      SELECT 1
        FROM vault.decrypted_secrets
       WHERE name = 'aoos_scheduler_hook'
         AND extensions.digest(decrypted_secret, 'sha256') =
             extensions.digest(_token, 'sha256')
    ),
    false
  );
$verify$;

REVOKE ALL ON FUNCTION public.verify_scheduler_hook_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_scheduler_hook_token(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_scheduler_hook_token(text) TO service_role;

DO $unschedule$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
      FROM cron.job
     WHERE jobname = 'aoos-gsc-daily-observe'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END
$unschedule$;

SELECT cron.schedule(
  'aoos-gsc-daily-observe',
  '5 16 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://trumove-resource-center.lovable.app/api/public/hooks/scheduler-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-AOOS-Scheduler-Token', (
          SELECT decrypted_secret
            FROM vault.decrypted_secrets
           WHERE name = 'aoos_scheduler_hook'
           LIMIT 1
        )
      ),
      body := jsonb_build_object('scheduleKey', 'gsc-daily-observe'),
      timeout_milliseconds := 15000
    );
  $job$
);
