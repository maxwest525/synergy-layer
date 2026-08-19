CREATE TABLE public.site_audit_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property text NOT NULL,
  origin text NOT NULL,
  facts jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  requested_by uuid
);

CREATE INDEX site_audit_snapshots_lookup_idx
  ON public.site_audit_snapshots (tenant_id, property, observed_at DESC);

GRANT SELECT, INSERT ON public.site_audit_snapshots TO authenticated;
GRANT ALL ON public.site_audit_snapshots TO service_role;

ALTER TABLE public.site_audit_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read site audit snapshots"
  ON public.site_audit_snapshots FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Tenant members record site audit snapshots"
  ON public.site_audit_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));