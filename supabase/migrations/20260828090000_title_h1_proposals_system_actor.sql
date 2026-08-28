-- The nightly propose-from-evidence job (pg_cron -> /api/public/hooks/
-- propose-from-evidence -> service-role client) calls create_title_h1_proposal
-- with a NULL actor, and the guard from 20260814080000 refused every such call
-- with 'That tenant is not visible to this account.', so the job could never
-- file a proposal. There is no operator in that path to name, and attributing
-- an autonomous run to a human would be a false record, so NULL now means the
-- governed system actor: EXECUTE is granted to service_role only, the hook has
-- already verified the scheduler token, and the draft still lands in
-- 'proposed' for a named human to approve. Interactive callers keep passing
-- the signed-in operator id, and for any non-null actor the membership and
-- role checks below are unchanged.
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
  IF _actor IS NULL THEN
    -- System path: only service_role can execute this function, so a NULL
    -- actor is the scheduler, never an anonymous browser. The tenant must
    -- still be real.
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) THEN
      RAISE EXCEPTION 'That tenant is not visible to this account.';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = _tenant_id AND user_id = _actor
    ) THEN
      RAISE EXCEPTION 'That tenant is not visible to this account.';
    END IF;
    IF NOT (public.has_role(_actor, 'admin'::app_role) OR public.has_role(_actor, 'operator'::app_role)) THEN
      RAISE EXCEPTION 'Only an operator or admin can generate a proposal.';
    END IF;
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
    _tenant_id,
    CASE WHEN _actor IS NULL THEN 'system' ELSE 'user' END,
    CASE WHEN _actor IS NULL THEN 'propose-from-evidence' ELSE _actor::text END,
    'title_h1.generated', 'change_request', v_change.id,
    _title || ': draft title/H1 proposal generated.',
    jsonb_build_object('targetUrl', _target_url, 'revisionCount', 0, 'proposalType', 'title_h1')
  );

  RETURN jsonb_build_object('changed', true, 'change_request', to_jsonb(v_change));
END;
$$;
