CREATE TABLE public.keyword_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  source text NOT NULL,
  location_code integer NOT NULL DEFAULT 2840,
  language_code text NOT NULL DEFAULT 'en',
  seed text,
  snapshot_id uuid REFERENCES public.dataforseo_snapshots(id) ON DELETE SET NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_state text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, keyword, location_code, language_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.keyword_candidates TO authenticated;
GRANT ALL ON public.keyword_candidates TO service_role;
ALTER TABLE public.keyword_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read keyword candidates"
  ON public.keyword_candidates FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant members manage keyword candidates"
  ON public.keyword_candidates FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE public.tracked_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  location_code integer NOT NULL DEFAULT 2840,
  language_code text NOT NULL DEFAULT 'en',
  label text,
  candidate_id uuid REFERENCES public.keyword_candidates(id) ON DELETE SET NULL,
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, keyword, location_code, language_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_keywords TO authenticated;
GRANT ALL ON public.tracked_keywords TO service_role;
ALTER TABLE public.tracked_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read tracked keywords"
  ON public.tracked_keywords FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant members manage tracked keywords"
  ON public.tracked_keywords FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_tenant_member(tenant_id));

ALTER TABLE public.competitor_candidates
  ADD COLUMN IF NOT EXISTS domain_class text NOT NULL DEFAULT 'unclassified';