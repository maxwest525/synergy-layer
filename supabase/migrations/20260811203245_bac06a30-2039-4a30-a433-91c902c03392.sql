-- The four-argument routine was EXECUTE-granted to authenticated and trusted
-- caller-supplied proof. Remove it entirely and replace it with a service-only
-- routine that validates the proof against stored truth.
REVOKE ALL ON FUNCTION public.apply_change_request_rendered_proof(uuid, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_change_request_rendered_proof(uuid, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_change_request_rendered_proof(uuid, jsonb, text, text) FROM authenticated;
DROP FUNCTION public.apply_change_request_rendered_proof(uuid, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.apply_change_request_rendered_proof(
  _id uuid,
  _actor uuid,
  _proof jsonb,
  _notes text,
  _revision text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.change_requests%ROWTYPE;
  v_now timestamptz := now();
  v_expected_title text;
  v_expected_heading text;
  v_final_url text;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'No actor was supplied, so no proof can be recorded.';
  END IF;

  SELECT * INTO v_row FROM public.change_requests WHERE id = _id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That change request is not available.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = v_row.tenant_id AND user_id = _actor
  ) THEN
    RAISE EXCEPTION 'That change request is not visible to this account.';
  END IF;

  IF NOT (public.has_role(_actor, 'admin'::app_role) OR public.has_role(_actor, 'operator'::app_role)) THEN
    RAISE EXCEPTION 'Only an operator or admin can record a published proof.';
  END IF;

  -- Allowlisted target, re-checked here so a tampered row cannot widen scope.
  IF v_row.source_repo IS DISTINCT FROM 'maxwest525/brittmove-829a7519'
     OR v_row.source_branch IS DISTINCT FROM 'main'
     OR v_row.source_file IS DISTINCT FROM 'src/pages/services/servicesData.ts'
     OR v_row.source_project_id::text IS DISTINCT FROM '3c0c30e5-798a-425c-b077-6d5e8cb04e5b' THEN
    RAISE EXCEPTION 'This change request is outside the allowlisted execution target.';
  END IF;

  IF v_row.source_commit_sha IS NULL THEN
    RAISE EXCEPTION 'There is no recorded source commit, so nothing can be proven live.';
  END IF;

  IF _revision IS DISTINCT FROM COALESCE(v_row.source_commit_sha, v_row.source_revision_after) THEN
    RAISE EXCEPTION 'The supplied revision does not match the recorded source commit.';
  END IF;

  IF v_row.published_proof_at IS NOT NULL AND v_row.state IN ('applied','verified') THEN
    RETURN jsonb_build_object('changed', false, 'change_request', to_jsonb(v_row));
  END IF;

  IF v_row.state <> 'approved' THEN
    RAISE EXCEPTION 'A change request that is % cannot be marked applied from a rendered proof.', v_row.state;
  END IF;

  -- The proof must be a pass, must name the allowlisted public site, and must
  -- carry exactly the approved title and heading recorded on this request.
  IF COALESCE(_proof->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'The supplied proof does not report a match.';
  END IF;

  v_final_url := COALESCE(_proof->>'finalUrl', '');
  IF v_final_url NOT LIKE 'https://trumoveinc.com/%' AND v_final_url <> 'https://trumoveinc.com' THEN
    RAISE EXCEPTION 'The supplied proof does not name the allowlisted public site.';
  END IF;

  SELECT c->>'after' INTO v_expected_title
    FROM jsonb_array_elements(v_row.changes) AS c
    WHERE c->>'field' = 'seo_title' LIMIT 1;
  SELECT c->>'after' INTO v_expected_heading
    FROM jsonb_array_elements(v_row.changes) AS c
    WHERE c->>'field' = 'page_heading' LIMIT 1;

  IF v_expected_title IS NULL OR v_expected_heading IS NULL THEN
    RAISE EXCEPTION 'This change request does not store both an approved title and heading to prove.';
  END IF;

  IF _proof->>'foundTitle' IS DISTINCT FROM v_expected_title
     OR _proof->>'foundHeading' IS DISTINCT FROM v_expected_heading THEN
    RAISE EXCEPTION 'The supplied proof does not contain the exact approved title and heading.';
  END IF;

  UPDATE public.change_requests SET
    state = 'applied',
    published_proof_at = v_now,
    published_proof_notes = _notes,
    applied_by = _actor,
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
    _actor::text,
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
      'actorId', _actor
    )
  );

  RETURN jsonb_build_object('changed', true, 'change_request', to_jsonb(v_row));
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_change_request_rendered_proof(uuid, uuid, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_change_request_rendered_proof(uuid, uuid, jsonb, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_change_request_rendered_proof(uuid, uuid, jsonb, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_change_request_rendered_proof(uuid, uuid, jsonb, text, text) TO service_role;