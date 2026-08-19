CREATE OR REPLACE FUNCTION public.create_governed_proposal(
  _tenant_id uuid,
  _actor uuid,
  _idempotency_key text,
  _proposal_type text,
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
  IF _changes IS NULL OR jsonb_array_length(_changes) < 1 THEN
    RAISE EXCEPTION 'A proposal requires at least one exact before/after change.';
  END IF;
  IF _evidence IS NULL OR jsonb_array_length(_evidence) < 1 THEN
    RAISE EXCEPTION 'A proposal requires at least one evidence group.';
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
    _tenant_id, _idempotency_key, _title, 'proposed', _proposal_type, _target_url,
    _changes, _rationale, _evidence, _evidence_summary, _evidence_limitations, _risk_note,
    _generation_context, 0, _source_repo, _source_branch, _source_file,
    _source_project_id, _source_revision_before, 'github_exact_replacement',
    '[]'::jsonb,
    'Review finalized post-change measurement when available. Data availability is not a success judgment.'
  ) RETURNING * INTO v_change;

  INSERT INTO public.inbox_items (
    tenant_id, lane, source_module, subject_kind, subject_id,
    title, summary, priority, actions, metadata
  ) VALUES (
    _tenant_id, 'pending_approval', 'site-audit', 'change_request', v_change.id,
    'Review audit fix: ' || _title,
    'Review the exact before and after values, the evidence, and the source baseline. Approval authorizes only these changes.',
    1,
    jsonb_build_array(jsonb_build_object(
      'kind', 'review', 'label', 'Review audit fix', 'href', '/changes/' || v_change.id::text
    )),
    jsonb_build_object('proposalType', _proposal_type, 'category', 'change_request')
  ) RETURNING id INTO v_inbox;

  UPDATE public.change_requests SET inbox_item_id = v_inbox WHERE id = v_change.id
  RETURNING * INTO v_change;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    _tenant_id, 'user', _actor::text, 'audit_fix.proposed', 'change_request', v_change.id,
    _title || ': audit fix proposed.',
    jsonb_build_object('targetUrl', _target_url, 'proposalType', _proposal_type)
  );

  RETURN jsonb_build_object('changed', true, 'change_request', to_jsonb(v_change));
END;
$$;

REVOKE ALL ON FUNCTION public.create_governed_proposal(
  uuid, uuid, text, text, text, text, jsonb, text, jsonb, text, text, text,
  jsonb, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_governed_proposal(
  uuid, uuid, text, text, text, text, jsonb, text, jsonb, text, text, text,
  jsonb, text, text, text, text, text
) TO service_role;