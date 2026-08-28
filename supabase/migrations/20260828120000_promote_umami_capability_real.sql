-- Promote cap.umami from pending to real. The registry declaration's stated
-- condition ("pending until one authenticated read stores a snapshot") was met
-- on 2026-08-18: a succeeded measurement_runs row (authenticationSucceeded,
-- HTTP 200) stored four umami_snapshots rows for TruMove. The workflow runner
-- gates capability nodes on this column, so every 16:45 UTC firing of
-- umami-daily-observe since has failed with "not authorised yet" despite the
-- executor being complete. Registry sync is operator triggered, so the row is
-- promoted here rather than waiting on a manual sync; the sync now upserts the
-- same value from src/registry/modules/self-hosted-analytics.ts.
UPDATE public.capabilities
SET integration_state = 'real'
WHERE key = 'cap.umami'
  AND integration_state = 'pending';
