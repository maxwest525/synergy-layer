CREATE OR REPLACE FUNCTION public.apply_change_request_rendered_proof(
  _id uuid,
  _proof jsonb,
  _notes text,
  _revision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.change_requests%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;

  SELECT * INTO v_row FROM public.change_requests WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That change request is not available.';
  END IF;

  IF NOT public.is_tenant_member(v_row.tenant_id) THEN
    RAISE EXCEPTION 'That change request is not visible to this account.';
  END IF;

  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'operator'::app_role)) THEN
    RAISE EXCEPTION 'Only an operator or admin can record a published proof.';
  END IF;

  IF v_row.source_commit_sha IS NULL THEN
    RAISE EXCEPTION 'There is no recorded source commit, so nothing can be proven live.';
  END IF;

  IF v_row.published_proof_at IS NOT NULL AND v_row.state IN ('applied','verified') THEN
    RETURN jsonb_build_object('changed', false, 'change_request', to_jsonb(v_row));
  END IF;

  IF v_row.state <> 'approved' THEN
    RAISE EXCEPTION 'A change request that is % cannot be marked applied from a rendered proof.', v_row.state;
  END IF;

  UPDATE public.change_requests SET
    state = 'applied',
    published_proof_at = v_now,
    published_proof_notes = _notes,
    applied_by = v_uid,
    applied_at = v_now,
    applied_notes = _notes,
    source_revision_after = COALESCE(NULLIF(_revision, ''), source_revision_after)
  WHERE id = _id AND state = 'approved'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.change_requests WHERE id = _id;
    RETURN jsonb_build_object('changed', false, 'change_request', to_jsonb(v_row));
  END IF;

  IF v_row.recommendation_id IS NOT NULL THEN
    UPDATE public.recommendations SET state = 'applied'::recommendation_state
      WHERE id = v_row.recommendation_id;
  END IF;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    v_row.tenant_id,
    'user',
    v_uid::text,
    'change_request.applied',
    'change_request',
    v_row.id,
    v_row.title || ': from approved to applied, proven on the rendered public page.',
    jsonb_build_object(
      'changeRequestId', v_row.id,
      'fromState', 'approved',
      'toState', 'applied',
      'targetUrl', v_row.target_url,
      'commitSha', v_row.source_commit_sha,
      'proof', _proof,
      'actorId', v_uid
    )
  );

  RETURN jsonb_build_object('changed', true, 'change_request', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.apply_change_request_rendered_proof(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_change_request_rendered_proof(uuid, jsonb, text, text) TO authenticated;