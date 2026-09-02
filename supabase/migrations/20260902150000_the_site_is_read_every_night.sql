-- The live site is read every night, and each night is compared with the one before.
--
-- IDEA-22 (gap digest MON-17), backlog CODE-87. The page audit renders pages on
-- an operator's click and the Search Console read reports what Google saw days
-- ago; between clicks nothing read the site itself, so a page that started
-- answering 404, went noindex or changed its canonical was found at the next
-- audit rather than the next morning.
--
-- site_watch_reads: one row per tenant, page address and UTC date, written by
-- the service role from the nightly workflow (site-nightly-watch) or from the
-- operator's own "read now". Members read their tenant's rows.
-- Rollback: DROP TABLE public.site_watch_reads.

CREATE TABLE IF NOT EXISTS public.site_watch_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property text NOT NULL,
  origin text NOT NULL,
  url text NOT NULL,
  observed_on date NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  status integer,
  final_url text,
  noindex boolean,
  robots text,
  canonical text,
  title text,
  error text,
  run_id uuid REFERENCES public.measurement_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, url, observed_on)
);
CREATE INDEX IF NOT EXISTS site_watch_reads_tenant_url_observed_idx
  ON public.site_watch_reads (tenant_id, url, observed_on DESC);

REVOKE ALL ON public.site_watch_reads FROM anon;
GRANT SELECT ON public.site_watch_reads TO authenticated;
GRANT ALL ON public.site_watch_reads TO service_role;

ALTER TABLE public.site_watch_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_watch_reads_read ON public.site_watch_reads;
CREATE POLICY site_watch_reads_read ON public.site_watch_reads
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
