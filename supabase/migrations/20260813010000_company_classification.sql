ALTER TABLE public.competitor_candidates
  ADD COLUMN IF NOT EXISTS company_classification text,
  ADD COLUMN IF NOT EXISTS classification_updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS classification_updated_at timestamptz;

ALTER TABLE public.competitor_candidates
  DROP CONSTRAINT IF EXISTS competitor_candidates_company_classification_check;
ALTER TABLE public.competitor_candidates
  ADD CONSTRAINT competitor_candidates_company_classification_check
  CHECK (
    company_classification IS NULL OR company_classification IN (
      'carrier',
      'broker',
      'lead_vendor',
      'publisher_directory',
      'other'
    )
  );
