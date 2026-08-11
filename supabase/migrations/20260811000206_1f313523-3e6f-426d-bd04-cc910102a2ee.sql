
CREATE TABLE public.ad_vendor_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  label text,
  note text,
  active boolean NOT NULL DEFAULT true,
  resolution_state text NOT NULL DEFAULT 'unresolved',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_vendor_watchlist TO authenticated;
GRANT ALL ON public.ad_vendor_watchlist TO service_role;
ALTER TABLE public.ad_vendor_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read ad vendor watchlist" ON public.ad_vendor_watchlist FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members manage ad vendor watchlist" ON public.ad_vendor_watchlist FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE public.ad_advertisers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  advertiser_id text NOT NULL,
  advertiser_name text,
  ad_funded_by text,
  vendor_domain text,
  is_verified boolean NOT NULL DEFAULT false,
  confirmed_by uuid,
  confirmed_at timestamptz,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, advertiser_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_advertisers TO authenticated;
GRANT ALL ON public.ad_advertisers TO service_role;
ALTER TABLE public.ad_advertisers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read ad advertisers" ON public.ad_advertisers FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members manage ad advertisers" ON public.ad_advertisers FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE TRIGGER touch_ad_advertisers BEFORE UPDATE ON public.ad_advertisers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ad_advertiser_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  advertiser_id text NOT NULL,
  advertiser_name text,
  ad_funded_by text,
  match_confidence numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_state text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, query_text, advertiser_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_advertiser_candidates TO authenticated;
GRANT ALL ON public.ad_advertiser_candidates TO service_role;
ALTER TABLE public.ad_advertiser_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read ad advertiser candidates" ON public.ad_advertiser_candidates FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members manage ad advertiser candidates" ON public.ad_advertiser_candidates FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  advertiser_fk uuid NOT NULL REFERENCES public.ad_advertisers(id) ON DELETE CASCADE,
  ad_creative_id text NOT NULL,
  format text,
  target_domain text,
  link text,
  headline text,
  long_headline text,
  snippet text,
  call_to_action text,
  sitelinks jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_ref text,
  video_ref text,
  content_checksum text NOT NULL,
  regions jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_shown timestamptz,
  last_shown timestamptz,
  total_days_shown integer,
  messaging jsonb NOT NULL DEFAULT '{}'::jsonb,
  family_key text,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ad_creative_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creatives TO authenticated;
GRANT ALL ON public.ad_creatives TO service_role;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read ad creatives" ON public.ad_creatives FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members manage ad creatives" ON public.ad_creatives FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE INDEX ad_creatives_advertiser_idx ON public.ad_creatives (tenant_id, advertiser_fk);

CREATE TABLE public.ad_creative_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  advertiser_fk uuid REFERENCES public.ad_advertisers(id) ON DELETE CASCADE,
  family_key text NOT NULL,
  label text,
  representative_creative_fk uuid REFERENCES public.ad_creatives(id) ON DELETE SET NULL,
  member_creative_ids text[] NOT NULL DEFAULT '{}',
  similarity_method text NOT NULL DEFAULT 'normalized_token_shingle',
  member_count integer NOT NULL DEFAULT 0,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  UNIQUE (tenant_id, family_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_creative_families TO authenticated;
GRANT ALL ON public.ad_creative_families TO service_role;
ALTER TABLE public.ad_creative_families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read ad creative families" ON public.ad_creative_families FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members manage ad creative families" ON public.ad_creative_families FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE public.ad_destination_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  creative_fk uuid REFERENCES public.ad_creatives(id) ON DELETE SET NULL,
  url text NOT NULL,
  final_url text,
  redirect_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  dom_hash text,
  observations jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetch_error text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, url, dom_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_destination_pages TO authenticated;
GRANT ALL ON public.ad_destination_pages TO service_role;
ALTER TABLE public.ad_destination_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read ad destination pages" ON public.ad_destination_pages FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members manage ad destination pages" ON public.ad_destination_pages FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE public.ad_live_serp_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  location text,
  device text NOT NULL DEFAULT 'desktop',
  gl text NOT NULL DEFAULT 'us',
  hl text NOT NULL DEFAULT 'en',
  observed_at timestamptz NOT NULL DEFAULT now(),
  reporting_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  ad_count integer NOT NULL DEFAULT 0,
  ads_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_fingerprint text NOT NULL,
  source_url text,
  cost_usd numeric NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, request_fingerprint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_live_serp_observations TO authenticated;
GRANT ALL ON public.ad_live_serp_observations TO service_role;
ALTER TABLE public.ad_live_serp_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members read ad live serp observations" ON public.ad_live_serp_observations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "Tenant members manage ad live serp observations" ON public.ad_live_serp_observations FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

INSERT INTO public.ad_vendor_watchlist (tenant_id, domain, label, note)
SELECT t.id, d.domain, 'Lead vendor', 'Seeded from the operator supplied vendor watchlist.'
FROM public.tenants t
CROSS JOIN (VALUES
  ('equatemedia.com'), ('billy.com'), ('moveadvisor.com'), ('mymovingreviews.com'),
  ('resultcalls.com'), ('doppcall.com'), ('99calls.com'), ('quoterunner.com'),
  ('movematcher.com'), ('budgetvanlines.com'), ('2movers.com')
) AS d(domain)
ON CONFLICT (tenant_id, domain) DO NOTHING;
