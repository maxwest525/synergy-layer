-- An operator's decision to set a page check aside.
--
-- Page-audit findings are recomputed on every read rather than stored, so there
-- was no row to mark ignored and the queue reported the verb as unavailable.
-- One row per (tenant, fingerprint) is enough: the fingerprint the queue
-- already builds ("audit:<check>", "site:<check>") is stable across reads.
-- Restoring deletes the row, so nothing accumulates a second state to reason
-- about, and re-ignoring is an upsert on the same key.
CREATE TABLE IF NOT EXISTS public.suggestion_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  suppressed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fingerprint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestion_suppressions TO authenticated;
GRANT ALL ON public.suggestion_suppressions TO service_role;
ALTER TABLE public.suggestion_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ss_read ON public.suggestion_suppressions;
CREATE POLICY ss_read ON public.suggestion_suppressions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS ss_write ON public.suggestion_suppressions;
CREATE POLICY ss_write ON public.suggestion_suppressions FOR ALL TO authenticated
  USING (public.is_operator() AND public.is_tenant_member(tenant_id))
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));
CREATE INDEX IF NOT EXISTS idx_ss_tenant ON public.suggestion_suppressions (tenant_id);
