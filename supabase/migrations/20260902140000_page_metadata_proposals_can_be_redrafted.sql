-- Page metadata proposals can be redrafted.
--
-- Backlog CODE-4. `revise_page_wording_proposal` refuses any proposal that is
-- not `page_wording`, so the page-metadata lane had no redraft path at all: a
-- meta description draft the operator disliked could only be rejected and
-- drafted again from its finding. This is the same immutable-revision write
-- for the metadata lane: a new `change_request_versions` row, the draft
-- rewritten in place, its inbox item reopened, and the revision logged. It
-- accepts only `page_metadata` and only `regenerate` (the lane has no hand
-- edit); the wording lane keeps its own stricter function.
-- Rollback: DROP FUNCTION public.revise_page_metadata_proposal(uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text);
CREATE OR REPLACE FUNCTION public.revise_page_metadata_proposal(
  _id uuid, _actor uuid, _revision_kind text, _changes jsonb, _rationale text,
  _evidence jsonb, _evidence_summary text, _evidence_limitations text, _risk_note text,
  _generation_context jsonb, _source_revision_before text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_change public.change_requests%ROWTYPE;
  v_version integer;
BEGIN
  IF _revision_kind <> 'regenerate' THEN
    RAISE EXCEPTION 'Only regenerate may create a metadata proposal version.';
  END IF;
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'A revision needs a named actor.';
  END IF;
  IF auth.uid() IS NOT NULL AND _actor IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'A revision is recorded as the signed-in account, not on its behalf.';
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
  IF v_change.proposal_type <> 'page_metadata' THEN
    RAISE EXCEPTION 'Only a page metadata proposal can be revised here.';
  END IF;
  IF v_change.state <> 'proposed' THEN
    RAISE EXCEPTION 'Approved proposals are immutable; start a new draft.';
  END IF;
  IF _changes IS NULL OR jsonb_array_length(_changes) < 1
     OR _evidence IS NULL OR jsonb_array_length(_evidence) < 1 THEN
    RAISE EXCEPTION 'A page metadata proposal requires at least one exact change and one evidence group.';
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
      'Revision %s was created by %s. Review the exact description, evidence, and source baseline.',
      v_version, _revision_kind
    )
  WHERE id = v_change.inbox_item_id;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    v_change.tenant_id, 'user', _actor::text, 'page_metadata.' || _revision_kind,
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
$function$;

REVOKE EXECUTE ON FUNCTION public.revise_page_metadata_proposal(uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revise_page_metadata_proposal(uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text) TO service_role;
