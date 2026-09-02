-- A blocked SEO run says why, and its lane carries the lane's name.
--
-- Database review 2026-09-02, DB-11 (backlog CODE-44). All six stored runs
-- are `preflight_blocked` with `failure_reason` NULL: the preflight result
-- was written to the run's event payload and never to the run, so the
-- screen that reads the run showed a block with no cause. The server now
-- writes the sentence (preflight-words.ts); this backfills the six rows from
-- the latest preflight event each already carries. The `change_type` CHECK
-- still enforced the lane's old name, `title_h1`, four days after the lane
-- became `page_wording`; it admits both, defaults to the current name, and
-- the stored rows move.
-- Rollback: the single-value CHECK and default; SET failure_reason = NULL
-- WHERE state = 'preflight_blocked'; SET change_type = 'title_h1'.
ALTER TABLE public.seo_runs
  DROP CONSTRAINT IF EXISTS seo_runs_change_type_check;
ALTER TABLE public.seo_runs
  ADD CONSTRAINT seo_runs_change_type_check
  CHECK (change_type IN ('title_h1', 'page_wording'));
ALTER TABLE public.seo_runs
  ALTER COLUMN change_type SET DEFAULT 'page_wording';

UPDATE public.seo_runs
SET change_type = 'page_wording'
WHERE change_type = 'title_h1';

UPDATE public.seo_runs r
SET failure_reason = (
  SELECT 'Preflight blocked the run: '
    || concat_ws('; ',
         CASE WHEN jsonb_array_length(COALESCE(e.payload->'missingConnectors', '[]'::jsonb)) > 0
              THEN 'connectors not real: ' || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(e.payload->'missingConnectors') AS x) END,
         CASE WHEN jsonb_array_length(COALESCE(e.payload->'unhealthyConnectors', '[]'::jsonb)) > 0
              THEN 'connectors unhealthy: ' || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(e.payload->'unhealthyConnectors') AS x) END,
         CASE WHEN jsonb_array_length(COALESCE(e.payload->'missingEvidence', '[]'::jsonb)) > 0
              THEN 'no stored evidence from: ' || (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(e.payload->'missingEvidence') AS x) END)
    || '.'
  FROM public.seo_run_events e
  WHERE e.run_id = r.id AND e.state = 'preflight_blocked'
  ORDER BY e.created_at DESC
  LIMIT 1
)
WHERE r.state = 'preflight_blocked' AND r.failure_reason IS NULL;
