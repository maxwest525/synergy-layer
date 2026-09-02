-- Search Console attempts are ledgered like every other provider's.
--
-- Monitoring review 2026-09-02, MON-5 (backlog CODE-54). GA4, Umami,
-- PageSpeed and Google Ads open a `measurement_runs` row per attempt and
-- close it with the outcome; Search Console never did, so a failed
-- observation reached `capabilities.health` and an Inbox item but never the
-- cadence card (which reads runs) or the Command center's "N providers are
-- failing" count. The CHECK on `provider` did not even admit the value. It
-- does now; the server opens and closes the row (run-ledger.server.ts).
-- Rollback: the three-value CHECK.
ALTER TABLE public.measurement_runs
  DROP CONSTRAINT IF EXISTS measurement_runs_provider_check;
ALTER TABLE public.measurement_runs
  ADD CONSTRAINT measurement_runs_provider_check
  CHECK (provider IN ('pagespeed', 'ga4', 'umami', 'gsc'));
