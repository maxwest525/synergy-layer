CREATE TABLE public.openai_ads_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pixel_id TEXT NOT NULL,
  transport TEXT NOT NULL CHECK (transport IN ('browser','capi')),
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  source_path TEXT,
  source_project TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivery_status TEXT NOT NULL DEFAULT 'received' CHECK (delivery_status IN ('received','delivered','failed')),
  delivery_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX openai_ads_events_identity_idx
  ON public.openai_ads_events (tenant_id, pixel_id, transport, event_id);
CREATE INDEX openai_ads_events_recent_idx
  ON public.openai_ads_events (tenant_id, occurred_at DESC);
CREATE INDEX openai_ads_events_dedup_idx
  ON public.openai_ads_events (tenant_id, pixel_id, event_id);

GRANT SELECT ON public.openai_ads_events TO authenticated;
GRANT ALL ON public.openai_ads_events TO service_role;

ALTER TABLE public.openai_ads_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read OpenAI Ads events"
  ON public.openai_ads_events FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));