CREATE TABLE IF NOT EXISTS public.authority_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_url text NOT NULL,
  rule_key text NOT NULL,
  query_class text NOT NULL
    CHECK (query_class IN ('community','local_service','professional_b2b','ymyl','general')),
  severity text NOT NULL CHECK (severity IN ('info','low','medium','high')),
  confidence text NOT NULL CHECK (confidence IN ('low','medium','high')),
  observed jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_evidence text[] NOT NULL DEFAULT '{}',
  knowledge_chunk_ids uuid[] NOT NULL DEFAULT '{}',
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, target_url, rule_key, fingerprint),
  UNIQUE (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS public.authority_finding_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL,
  source_kind text NOT NULL,
  source_ref text NOT NULL,
  observed_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, finding_id, source_kind, source_ref, content_sha256),
  FOREIGN KEY (finding_id, tenant_id)
    REFERENCES public.authority_findings(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.authority_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finding_id uuid NOT NULL,
  action_key text NOT NULL,
  label text NOT NULL,
  rationale text NOT NULL,
  requires_exact_change boolean NOT NULL,
  state text NOT NULL DEFAULT 'suggested'
    CHECK (state IN ('suggested','proposed','dismissed')),
  change_request_id uuid REFERENCES public.change_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, finding_id, action_key),
  FOREIGN KEY (finding_id, tenant_id)
    REFERENCES public.authority_findings(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS authority_findings_target_detected
  ON public.authority_findings(tenant_id, target_url, detected_at DESC);
CREATE INDEX IF NOT EXISTS authority_actions_state
  ON public.authority_actions(tenant_id, state, created_at DESC);

CREATE OR REPLACE FUNCTION public.reject_authority_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Authority finding history is append-only.';
END;
$$;

DROP TRIGGER IF EXISTS protect_authority_findings ON public.authority_findings;
CREATE TRIGGER protect_authority_findings
  BEFORE UPDATE OR DELETE ON public.authority_findings
  FOR EACH ROW EXECUTE FUNCTION public.reject_authority_history_mutation();
DROP TRIGGER IF EXISTS protect_authority_finding_evidence ON public.authority_finding_evidence;
CREATE TRIGGER protect_authority_finding_evidence
  BEFORE UPDATE OR DELETE ON public.authority_finding_evidence
  FOR EACH ROW EXECUTE FUNCTION public.reject_authority_history_mutation();
DROP TRIGGER IF EXISTS touch_authority_actions ON public.authority_actions;
CREATE TRIGGER touch_authority_actions BEFORE UPDATE ON public.authority_actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.authority_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_finding_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authority_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authority_findings_read ON public.authority_findings;
CREATE POLICY authority_findings_read ON public.authority_findings
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS authority_evidence_read ON public.authority_finding_evidence;
CREATE POLICY authority_evidence_read ON public.authority_finding_evidence
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
DROP POLICY IF EXISTS authority_actions_read ON public.authority_actions;
CREATE POLICY authority_actions_read ON public.authority_actions
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

REVOKE ALL ON public.authority_findings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.authority_finding_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.authority_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.authority_findings TO authenticated;
GRANT SELECT ON public.authority_finding_evidence TO authenticated;
GRANT SELECT ON public.authority_actions TO authenticated;
GRANT ALL ON public.authority_findings TO service_role;
GRANT ALL ON public.authority_finding_evidence TO service_role;
GRANT ALL ON public.authority_actions TO service_role;
