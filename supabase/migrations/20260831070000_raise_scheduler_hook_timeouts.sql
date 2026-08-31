-- The scheduler-tick endpoint was 500ing outright until recently (CODE-9),
-- which meant no job's http_post ever ran long enough to hit its timeout.
-- Live data now shows the endpoint answering real requests -- umami and
-- propose-from-evidence both return 200 with real JSON -- but GSC and GA4
-- daily-observe are timing out (net._http_response ids 58/59, 2026-08-30):
-- DNS/TCP/SSL all succeed in under 60ms, then nothing comes back inside the
-- window. That shape (fast connect, slow response) is what a live,
-- credentialed round trip to Google's Search Console / Analytics Data APIs
-- looks like, not a wrong endpoint -- there is nothing left to fix on the
-- routing side. GSC's timeout was 15s and GA4 had no explicit timeout at
-- all, defaulting to net.http_post's 5s. Both are raised to 30s, matching
-- the existing 20s/60s precedent in 20260818042307 for the same reason.

select cron.schedule(
  'aoos-gsc-daily-observe',
  '5 16 * * *',
  $cron$
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
      timeout_milliseconds := 30000
    );
  $cron$
);

select cron.schedule(
  'aoos-ga4-daily-observe',
  '35 16 * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://trumove-resource-center.lovable.app/api/public/hooks/scheduler-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-AOOS-Scheduler-Token', (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'aoos_scheduler_hook' LIMIT 1
        )
      ),
      body := jsonb_build_object('scheduleKey', 'ga4-daily-observe'),
      timeout_milliseconds := 30000
    );
  $cron$
);
