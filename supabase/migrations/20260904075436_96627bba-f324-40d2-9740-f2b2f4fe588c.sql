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