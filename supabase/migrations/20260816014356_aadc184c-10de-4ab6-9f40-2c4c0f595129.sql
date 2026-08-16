ALTER TABLE public.openai_ads_events
  ADD COLUMN IF NOT EXISTS oppref text,
  ADD COLUMN IF NOT EXISTS attribution_source text;

CREATE INDEX IF NOT EXISTS openai_ads_events_oppref_idx
  ON public.openai_ads_events (tenant_id, pixel_id)
  WHERE oppref IS NOT NULL;