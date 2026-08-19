CREATE TABLE public.page_metadata_observations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property text NOT NULL,
  url text NOT NULL,
  final_url text,
  title text,
  h1 text,
  rendered_by text,
  error text,
  observed_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid
);

CREATE INDEX page_metadata_observations_lookup_idx
  ON public.page_metadata_observations (tenant_id, property, url, observed_at DESC);

GRANT SELECT, INSERT ON public.page_metadata_observations TO authenticated;
GRANT ALL ON public.page_metadata_observations TO service_role;

ALTER TABLE public.page_metadata_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read page metadata observations"
  ON public.page_metadata_observations FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant members record page metadata observations"
  ON public.page_metadata_observations FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));