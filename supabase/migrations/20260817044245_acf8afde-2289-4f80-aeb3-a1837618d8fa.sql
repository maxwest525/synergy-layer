ALTER TABLE public.openai_ads_event_rules
  DROP CONSTRAINT IF EXISTS openai_ads_event_rules_custom_name_check;

UPDATE public.openai_ads_event_rules SET custom_event_name = '' WHERE custom_event_name IS NULL;
UPDATE public.openai_ads_deliveries SET custom_event_name = '' WHERE custom_event_name IS NULL;

ALTER TABLE public.openai_ads_event_rules
  ALTER COLUMN custom_event_name SET DEFAULT '',
  ALTER COLUMN custom_event_name SET NOT NULL;
ALTER TABLE public.openai_ads_event_rules
  ADD CONSTRAINT openai_ads_event_rules_custom_name_check CHECK (
    (event_type = 'custom' AND custom_event_name <> '')
    OR (event_type <> 'custom' AND custom_event_name = ''));

ALTER TABLE public.openai_ads_deliveries
  ALTER COLUMN custom_event_name SET DEFAULT '',
  ALTER COLUMN custom_event_name SET NOT NULL;