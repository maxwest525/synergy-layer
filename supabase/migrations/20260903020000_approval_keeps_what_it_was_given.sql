-- Approval keeps the evidence it was handed, instead of destroying it.
--
-- BACKLOG CODE-95. `approveKeywords` copied five columns into tracked_keywords
-- (keyword, locale, candidate_id, approved_by, active) and dropped everything
-- else the candidate row carried: search volume, CPC, competition, keyword
-- difficulty, search intent, the competitor it came from and that competitor's
-- SERP position. DataForSEO was paid for part of that, twice over -- the Labs
-- discovery call that produced the candidate, and the metered enrichment click
-- that scored it. None of it survived the operator pressing Approve.
--
-- Two things made the loss permanent rather than merely inconvenient.
-- `candidate_id` is ON DELETE SET NULL, so the only route back to the metrics
-- is severable by design; and `enrichPendingCandidates` filters
-- review_state = 'pending', so an approved keyword can never be re-enriched to
-- recover them. The evidence was reachable exactly once, at the click.
--
-- What this adds: a snapshot of the candidate's metrics on the approved row,
-- taken at approval time, with the provenance to say where it came from and
-- when. jsonb rather than exploded columns, deliberately: the shape is
-- DataForSEO's, `keyword_candidates.metrics` already stores it that way, and
-- keyword-enrichment.server.ts states in its own header that the response shape
-- has not been verified against a live snapshot. Inventing typed columns for
-- fields nobody has confirmed would be the invented-schema version of an
-- invented threshold.
--
-- Nothing is backfilled. The 50 rows approved before today were approved
-- without this column and no stored evidence says what their metrics were at
-- that moment; writing today's candidate metrics onto them would date a
-- reading to a click that happened weeks ago. They stay NULL and read as the
-- absence they are.
--
-- Rollback:
--   ALTER TABLE public.tracked_keywords
--     DROP COLUMN approved_metrics,
--     DROP COLUMN approved_metrics_captured_at,
--     DROP COLUMN approved_metrics_candidate_id;

ALTER TABLE public.tracked_keywords
  ADD COLUMN IF NOT EXISTS approved_metrics jsonb,
  ADD COLUMN IF NOT EXISTS approved_metrics_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_metrics_candidate_id uuid;

COMMENT ON COLUMN public.tracked_keywords.approved_metrics IS
  'The candidate row''s metrics as they stood when the operator approved this keyword. Provider-shaped (DataForSEO), never rewritten afterwards. NULL means no metrics were stored at approval, which is not the same as zero.';

COMMENT ON COLUMN public.tracked_keywords.approved_metrics_captured_at IS
  'When the snapshot in approved_metrics was taken. Always the approval moment, never the provider''s own retrieval time.';

COMMENT ON COLUMN public.tracked_keywords.approved_metrics_candidate_id IS
  'The keyword_candidates row the snapshot came from, kept even after candidate_id is nulled by ON DELETE SET NULL, so the provenance survives the deletion the foreign key permits.';
