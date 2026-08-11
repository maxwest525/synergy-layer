CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  title text NOT NULL,
  state text NOT NULL DEFAULT 'proposed'
    CHECK (state IN ('proposed','approved','applied','verified','rejected','rolled_back')),
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  target_url text NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(changes) = 'array'),
  rationale text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  evidence_summary text NOT NULL DEFAULT '',
  evidence_limitations text NOT NULL DEFAULT '',
  risk_note text,
  source_project_id text,
  source_project_name text,
  source_project_url text,
  source_file text,
  source_revision_before text,
  source_revision_after text,
  implementation_method text NOT NULL DEFAULT 'manual_operator_edit',
  verification_baseline jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(verification_baseline) = 'array'),
  verification_followup text,
  recommendation_id uuid REFERENCES public.recommendations(id) ON DELETE SET NULL,
  inbox_item_id uuid REFERENCES public.inbox_items(id) ON DELETE SET NULL,
  proposed_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamp with time zone,
  rejected_by uuid,
  rejected_at timestamp with time zone,
  applied_by uuid,
  applied_at timestamp with time zone,
  applied_notes text,
  verified_by uuid,
  verified_at timestamp with time zone,
  verification_notes text,
  rolled_back_by uuid,
  rolled_back_at timestamp with time zone,
  rollback_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT change_requests_tenant_key_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT change_requests_approved_pair CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CONSTRAINT change_requests_rejected_pair CHECK ((rejected_by IS NULL) = (rejected_at IS NULL)),
  CONSTRAINT change_requests_applied_pair CHECK ((applied_by IS NULL) = (applied_at IS NULL)),
  CONSTRAINT change_requests_verified_pair CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
  CONSTRAINT change_requests_rolled_back_pair CHECK ((rolled_back_by IS NULL) = (rolled_back_at IS NULL)),
  CONSTRAINT change_requests_applied_requires_approval CHECK (applied_at IS NULL OR approved_at IS NOT NULL),
  CONSTRAINT change_requests_verified_requires_applied CHECK (verified_at IS NULL OR applied_at IS NOT NULL)
);

CREATE INDEX change_requests_tenant_state_idx ON public.change_requests (tenant_id, state, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.change_requests TO authenticated;
GRANT ALL ON public.change_requests TO service_role;

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read change requests"
  ON public.change_requests FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "Operators create change requests"
  ON public.change_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  );

CREATE POLICY "Operators update change requests"
  ON public.change_requests FOR UPDATE TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator'))
  );

CREATE TRIGGER change_requests_touch_updated_at
  BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$
DECLARE
  v_tenant uuid;
  v_asset uuid;
  v_rec uuid;
  v_inbox uuid;
  v_change uuid;
  v_title text := 'Retitle corporate relocation page around employee relocation queries';
  v_evidence jsonb := '[
    {"query":"employee relocation movers","date":"2026-08-03","average_position":86,"impressions":1},
    {"query":"employee relocation movers","date":"2026-08-06","average_position":83,"impressions":1},
    {"query":"employee relocation movers","date":"2026-08-08","average_position":77,"impressions":1},
    {"query":"employee moving company","date":"2026-08-08","average_position":76,"impressions":1}
  ]'::jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'trumove' LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_asset FROM public.assets
   WHERE tenant_id = v_tenant AND external_ref = 'https://trumoveinc.com' LIMIT 1;

  SELECT id INTO v_change FROM public.change_requests
   WHERE tenant_id = v_tenant AND idempotency_key = 'gsc.corporate-relocation.title-h1.v1';

  IF v_change IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_rec FROM public.recommendations
   WHERE tenant_id = v_tenant AND issue_fingerprint = 'change-request:gsc.corporate-relocation.title-h1.v1';

  IF v_rec IS NULL THEN
    INSERT INTO public.recommendations (
      tenant_id, title, description, source_module,
      business_impact, revenue_impact, traffic_impact, risk,
      confidence, time_saved_minutes, reasoning, suggested_action,
      requires_approval, state, issue_fingerprint, metadata
    ) VALUES (
      v_tenant,
      v_title,
      'Change the SEO title and visible page heading on https://trumoveinc.com/services/corporate-relocation to match the employee-relocation wording Search Console already recorded for this page.',
      'search-console',
      'low','none','low','low',
      0.35, 15,
      'Align the title and visible H1 more directly to the two observed employee-relocation query formulations while preserving the page current business meaning.',
      '{"kind":"apply_page_change","idempotencyKey":"gsc.corporate-relocation.title-h1.v1"}'::jsonb,
      true, 'proposed',
      'change-request:gsc.corporate-relocation.title-h1.v1',
      '{"changeRequest":true}'::jsonb
    ) RETURNING id INTO v_rec;
  END IF;

  INSERT INTO public.change_requests (
    tenant_id, idempotency_key, title, state, asset_id, target_url,
    changes, rationale, evidence, evidence_summary, evidence_limitations, risk_note,
    source_project_id, source_project_name, source_project_url, source_file, source_revision_before,
    implementation_method, verification_baseline, verification_followup, recommendation_id
  ) VALUES (
    v_tenant,
    'gsc.corporate-relocation.title-h1.v1',
    v_title,
    'proposed',
    v_asset,
    'https://trumoveinc.com/services/corporate-relocation',
    '[
      {"field":"seo_title","label":"SEO title","before":"Corporate Relocation | Employee Moving Services | TruMove Inc","after":"Employee Relocation Movers | Corporate Moving | TruMove"},
      {"field":"page_heading","label":"Page heading (H1)","before":"Corporate Relocation","after":"Employee Relocation Moving Services"}
    ]'::jsonb,
    'Align the title and visible H1 more directly to the two observed employee-relocation query formulations while preserving the page current business meaning.',
    v_evidence,
    'Stored Search Console rows for this page show the query "employee relocation movers" at average position 86 on 2026-08-03, 83 on 2026-08-06 and 77 on 2026-08-08, and "employee moving company" at position 76 on 2026-08-08, each with 1 impression.',
    'Only four impressions across these disclosed rows, so this is a low-volume relevance hypothesis, not proof the change will improve rankings.',
    'Low, but the operator must review brand and readability before applying.',
    '3c0c30e5-798a-425c-b077-6d5e8cb04e5b',
    'TruMove Website Final',
    'https://lovable.dev/projects/3c0c30e5-798a-425c-b077-6d5e8cb04e5b',
    'src/pages/services/servicesData.ts',
    '2cca3c40b08f1f908e07072b93ef7caa5631d7a9',
    'manual_operator_edit',
    v_evidence,
    'After the edit is live, compare stored Search Console page-query rows for this page against the baseline above. Do not read absence of data as success.',
    v_rec
  ) RETURNING id INTO v_change;

  SELECT id INTO v_inbox FROM public.inbox_items
   WHERE tenant_id = v_tenant AND subject_kind = 'change_request' AND subject_id = v_change;

  IF v_inbox IS NULL THEN
    INSERT INTO public.inbox_items (
      tenant_id, lane, source_module, subject_kind, subject_id, title, summary, priority, actions
    ) VALUES (
      v_tenant, 'pending_approval', 'search-console', 'change_request', v_change,
      'Approve page change: retitle corporate relocation page around employee relocation queries',
      'Exact change on https://trumoveinc.com/services/corporate-relocation: SEO title and H1. Approving authorizes the change only; AOOS does not edit or publish the site.',
      1,
      format('[{"label":"Review the proposed change","href":"/changes/%s"}]', v_change)::jsonb
    ) RETURNING id INTO v_inbox;
  END IF;

  UPDATE public.change_requests SET inbox_item_id = v_inbox WHERE id = v_change;
END $$;