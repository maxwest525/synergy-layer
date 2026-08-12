-- Complete the operator-facing Search Console loop with append-only URL
-- inspections and sitemap submission attempts. Provider reads and writes stay
-- tenant scoped; only operators can create evidence or execution records.

CREATE TABLE IF NOT EXISTS public.search_console_url_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property text NOT NULL,
  inspected_url text NOT NULL,
  verdict text NOT NULL DEFAULT 'UNKNOWN',
  coverage_state text,
  robots_txt_state text,
  indexing_state text,
  page_fetch_state text,
  last_crawl_time timestamptz,
  google_canonical text,
  user_canonical text,
  crawled_as text,
  sitemaps text[] NOT NULL DEFAULT '{}',
  referring_urls text[] NOT NULL DEFAULT '{}',
  inspection_result_link text,
  mobile_usability_verdict text,
  rich_results_verdict text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gsc_url_inspection_http_url CHECK (inspected_url ~ '^https?://')
);

CREATE INDEX IF NOT EXISTS gsc_url_inspections_tenant_url_idx
  ON public.search_console_url_inspections (tenant_id, inspected_url, inspected_at DESC);

ALTER TABLE public.search_console_url_inspections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_console_url_inspections FROM PUBLIC, anon;
REVOKE UPDATE, DELETE ON public.search_console_url_inspections FROM authenticated;
GRANT SELECT, INSERT ON public.search_console_url_inspections TO authenticated;
GRANT ALL ON public.search_console_url_inspections TO service_role;
DROP POLICY IF EXISTS gsc_url_inspections_read ON public.search_console_url_inspections;
CREATE POLICY gsc_url_inspections_read
  ON public.search_console_url_inspections FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS gsc_url_inspections_insert ON public.search_console_url_inspections;
CREATE POLICY gsc_url_inspections_insert
  ON public.search_console_url_inspections FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

CREATE TABLE IF NOT EXISTS public.search_console_sitemap_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property text NOT NULL,
  sitemap_url text NOT NULL,
  status text NOT NULL CHECK (status IN ('submitted', 'failed')),
  failure_reason text,
  requested_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gsc_sitemap_submission_http_url CHECK (sitemap_url ~ '^https?://'),
  CONSTRAINT gsc_sitemap_submission_failure_pair CHECK (
    (status = 'failed' AND failure_reason IS NOT NULL)
    OR (status = 'submitted' AND failure_reason IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS gsc_sitemap_submissions_tenant_url_idx
  ON public.search_console_sitemap_submissions (tenant_id, sitemap_url, submitted_at DESC);

ALTER TABLE public.search_console_sitemap_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_console_sitemap_submissions FROM PUBLIC, anon;
REVOKE UPDATE, DELETE ON public.search_console_sitemap_submissions FROM authenticated;
GRANT SELECT, INSERT ON public.search_console_sitemap_submissions TO authenticated;
GRANT ALL ON public.search_console_sitemap_submissions TO service_role;
DROP POLICY IF EXISTS gsc_sitemap_submissions_read ON public.search_console_sitemap_submissions;
CREATE POLICY gsc_sitemap_submissions_read
  ON public.search_console_sitemap_submissions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS gsc_sitemap_submissions_insert ON public.search_console_sitemap_submissions;
CREATE POLICY gsc_sitemap_submissions_insert
  ON public.search_console_sitemap_submissions FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

-- The backfill and the daily scheduler may overlap. One property-total snapshot
-- per tenant/property/day keeps the evidence immutable and idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS gsc_property_totals_day_unique
  ON public.search_console_snapshots (tenant_id, property, period_start_pt)
  WHERE kind = 'property_totals';
