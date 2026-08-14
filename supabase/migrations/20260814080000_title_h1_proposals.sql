-- Title/H1 is the only proposal type. Initial generation stays on the current
-- row; Edit and Regenerate append immutable versions of the new current draft.
ALTER TABLE public.change_requests
  ADD COLUMN proposal_type text NOT NULL DEFAULT 'title_h1'
    CHECK (proposal_type = 'title_h1'),
  ADD COLUMN generation_context jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(generation_context) = 'object'),
  ADD COLUMN revision_count integer NOT NULL DEFAULT 0
    CHECK (revision_count >= 0);

CREATE TABLE public.change_request_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  change_request_id uuid NOT NULL REFERENCES public.change_requests(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  revision_kind text NOT NULL CHECK (revision_kind IN ('edit', 'regenerate')),
  changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
  rationale text NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array'),
  evidence_summary text NOT NULL,
  evidence_limitations text NOT NULL,
  risk_note text,
  generation_context jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(generation_context) = 'object'),
  source_revision_before text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (change_request_id, version_number)
);

CREATE INDEX change_request_versions_tenant_request_idx
  ON public.change_request_versions (tenant_id, change_request_id, version_number DESC);

ALTER TABLE public.change_request_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.change_request_versions TO authenticated;
GRANT ALL ON public.change_request_versions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.change_request_versions FROM authenticated;
REVOKE ALL ON public.change_request_versions FROM anon;

CREATE POLICY "Tenant members read change request versions"
  ON public.change_request_versions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.refuse_change_request_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Title/H1 proposal versions are immutable.';
END;
$$;

CREATE TRIGGER change_request_versions_are_immutable
BEFORE UPDATE OR DELETE ON public.change_request_versions
FOR EACH ROW EXECUTE FUNCTION public.refuse_change_request_version_mutation();

CREATE OR REPLACE FUNCTION public.lock_approved_title_h1_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.proposal_type = 'title_h1' AND OLD.state <> 'proposed' AND (
    NEW.proposal_type IS DISTINCT FROM OLD.proposal_type OR
    NEW.target_url IS DISTINCT FROM OLD.target_url OR
    NEW.changes IS DISTINCT FROM OLD.changes OR
    NEW.rationale IS DISTINCT FROM OLD.rationale OR
    NEW.evidence IS DISTINCT FROM OLD.evidence OR
    NEW.evidence_summary IS DISTINCT FROM OLD.evidence_summary OR
    NEW.evidence_limitations IS DISTINCT FROM OLD.evidence_limitations OR
    NEW.risk_note IS DISTINCT FROM OLD.risk_note OR
    NEW.generation_context IS DISTINCT FROM OLD.generation_context OR
    NEW.revision_count IS DISTINCT FROM OLD.revision_count OR
    NEW.source_repo IS DISTINCT FROM OLD.source_repo OR
    NEW.source_branch IS DISTINCT FROM OLD.source_branch OR
    NEW.source_file IS DISTINCT FROM OLD.source_file OR
    NEW.source_project_id IS DISTINCT FROM OLD.source_project_id OR
    NEW.source_revision_before IS DISTINCT FROM OLD.source_revision_before
  ) THEN
    RAISE EXCEPTION 'Approved title/H1 wording, evidence, and source baseline are immutable.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lock_approved_title_h1_content
BEFORE UPDATE ON public.change_requests
FOR EACH ROW EXECUTE FUNCTION public.lock_approved_title_h1_content();

CREATE OR REPLACE FUNCTION public.create_title_h1_proposal(
  _tenant_id uuid,
  _actor uuid,
  _idempotency_key text,
  _target_url text,
  _title text,
  _changes jsonb,
  _rationale text,
  _evidence jsonb,
  _evidence_summary text,
  _evidence_limitations text,
  _risk_note text,
  _generation_context jsonb,
  _source_repo text,
  _source_branch text,
  _source_file text,
  _source_project_id text,
  _source_revision_before text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_change public.change_requests%ROWTYPE;
  v_inbox uuid;
BEGIN
  IF _actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = _actor
  ) THEN
    RAISE EXCEPTION 'That tenant is not visible to this account.';
  END IF;
  IF NOT (public.has_role(_actor, 'admin'::app_role) OR public.has_role(_actor, 'operator'::app_role)) THEN
    RAISE EXCEPTION 'Only an operator or admin can generate a proposal.';
  END IF;
  IF jsonb_array_length(_changes) <> 2 OR jsonb_array_length(_evidence) <> 3 THEN
    RAISE EXCEPTION 'A title/H1 proposal requires two exact changes and three evidence classes.';
  END IF;

  SELECT * INTO v_change
  FROM public.change_requests
  WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('changed', false, 'change_request', to_jsonb(v_change));
  END IF;

  INSERT INTO public.change_requests (
    tenant_id, idempotency_key, title, state, proposal_type, target_url,
    changes, rationale, evidence, evidence_summary, evidence_limitations, risk_note,
    generation_context, revision_count, source_repo, source_branch, source_file,
    source_project_id, source_revision_before, implementation_method,
    verification_baseline, verification_followup
  ) VALUES (
    _tenant_id, _idempotency_key, _title, 'proposed', 'title_h1', _target_url,
    _changes, _rationale, _evidence, _evidence_summary, _evidence_limitations, _risk_note,
    _generation_context, 0, _source_repo, _source_branch, _source_file,
    _source_project_id, _source_revision_before, 'github_exact_replacement',
    '[]'::jsonb,
    'Review finalized post-change GSC and GA4 measurement when available. Data availability is not a success judgment.'
  ) RETURNING * INTO v_change;

  INSERT INTO public.inbox_items (
    tenant_id, lane, source_module, subject_kind, subject_id,
    title, summary, priority, actions, metadata
  ) VALUES (
    _tenant_id, 'pending_approval', 'title-h1-proposals', 'change_request', v_change.id,
    'Review title/H1 proposal: ' || _title,
    'Review the exact title, H1, evidence, and source baseline. Approval authorizes only these two wording changes.',
    1,
    jsonb_build_array(jsonb_build_object(
      'kind', 'review', 'label', 'Review title/H1 proposal', 'href', '/changes/' || v_change.id::text
    )),
    jsonb_build_object('proposalType', 'title_h1', 'category', 'change_request')
  ) RETURNING id INTO v_inbox;

  UPDATE public.change_requests SET inbox_item_id = v_inbox WHERE id = v_change.id
  RETURNING * INTO v_change;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    _tenant_id, 'user', _actor::text, 'title_h1.generated', 'change_request', v_change.id,
    _title || ': draft title/H1 proposal generated.',
    jsonb_build_object('targetUrl', _target_url, 'revisionCount', 0, 'proposalType', 'title_h1')
  );

  RETURN jsonb_build_object('changed', true, 'change_request', to_jsonb(v_change));
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_title_h1_proposal(
  _id uuid,
  _actor uuid,
  _revision_kind text,
  _changes jsonb,
  _rationale text,
  _evidence jsonb,
  _evidence_summary text,
  _evidence_limitations text,
  _risk_note text,
  _generation_context jsonb,
  _source_revision_before text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_change public.change_requests%ROWTYPE;
  v_version integer;
BEGIN
  IF _revision_kind NOT IN ('edit', 'regenerate') THEN
    RAISE EXCEPTION 'Only edit or regenerate may create a proposal version.';
  END IF;

  SELECT * INTO v_change FROM public.change_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = v_change.tenant_id AND user_id = _actor
  ) THEN
    RAISE EXCEPTION 'That proposal is not visible to this account.';
  END IF;
  IF NOT (public.has_role(_actor, 'admin'::app_role) OR public.has_role(_actor, 'operator'::app_role)) THEN
    RAISE EXCEPTION 'Only an operator or admin can revise a proposal.';
  END IF;
  IF v_change.proposal_type <> 'title_h1' OR v_change.state <> 'proposed' THEN
    RAISE EXCEPTION 'Approved title/H1 proposals are immutable; start a new draft.';
  END IF;
  IF jsonb_array_length(_changes) <> 2 OR jsonb_array_length(_evidence) <> 3 THEN
    RAISE EXCEPTION 'A title/H1 proposal requires two exact changes and three evidence classes.';
  END IF;

  v_version := v_change.revision_count + 1;
  INSERT INTO public.change_request_versions (
    tenant_id, change_request_id, version_number, revision_kind,
    changes, rationale, evidence, evidence_summary, evidence_limitations,
    risk_note, generation_context, source_revision_before, created_by
  ) VALUES (
    v_change.tenant_id, v_change.id, v_version, _revision_kind,
    _changes, _rationale, _evidence, _evidence_summary, _evidence_limitations,
    _risk_note, _generation_context, _source_revision_before, _actor
  );

  UPDATE public.change_requests SET
    changes = _changes,
    rationale = _rationale,
    evidence = _evidence,
    evidence_summary = _evidence_summary,
    evidence_limitations = _evidence_limitations,
    risk_note = _risk_note,
    generation_context = _generation_context,
    source_revision_before = _source_revision_before,
    revision_count = v_version
  WHERE id = v_change.id AND state = 'proposed'
  RETURNING * INTO v_change;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That draft changed while it was being revised. Refresh and try again.';
  END IF;

  UPDATE public.inbox_items SET
    lane = 'pending_approval',
    resolved_at = NULL,
    summary = format(
      'Revision %s was created by %s. Review the exact title, H1, evidence, and source baseline.',
      v_version, _revision_kind
    )
  WHERE id = v_change.inbox_item_id;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    v_change.tenant_id, 'user', _actor::text, 'title_h1.' || _revision_kind,
    'change_request', v_change.id,
    format('%s: %s created immutable revision %s.', v_change.title, _revision_kind, v_version),
    jsonb_build_object('revisionKind', _revision_kind, 'versionNumber', v_version)
  );

  RETURN jsonb_build_object(
    'changed', true,
    'version_number', v_version,
    'change_request', to_jsonb(v_change)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_title_h1_proposal(
  uuid, uuid, text, text, text, jsonb, text, jsonb, text, text, text,
  jsonb, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_title_h1_proposal(
  uuid, uuid, text, text, text, jsonb, text, jsonb, text, text, text,
  jsonb, text, text, text, text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.revise_title_h1_proposal(
  uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revise_title_h1_proposal(
  uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text
) TO service_role;

REVOKE ALL ON FUNCTION public.refuse_change_request_version_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_approved_title_h1_content() FROM PUBLIC, anon, authenticated;
