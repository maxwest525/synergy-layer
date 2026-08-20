-- The proposal_type CHECK was created inline in 20260814080000 while title/H1
-- was the only lane (Postgres auto-named it change_requests_proposal_type_check).
-- create_governed_proposal (20260819193612) already files 'site.crawl_directives'
-- audit fixes, which that CHECK rejects at insert, and the metadata lane adds
-- 'page_metadata'. Widen the constraint once, keeping the column closed to
-- anything a governed writer does not produce.
ALTER TABLE public.change_requests
  DROP CONSTRAINT IF EXISTS change_requests_proposal_type_check;

ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_proposal_type_check
    CHECK (proposal_type IN ('title_h1', 'page_metadata', 'site.crawl_directives'));

-- The post-approval immutability trigger (20260814080000) fired only for the
-- title/H1 type, so every newly admitted type would be mutable after
-- approval. "Approval locks the exact wording" must hold for every governed
-- lane: drop the type condition. The function name is kept so the existing
-- trigger keeps pointing at it.
CREATE OR REPLACE FUNCTION public.lock_approved_title_h1_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.state <> 'proposed' AND (
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
    RAISE EXCEPTION 'Approved proposal wording, evidence, and source baseline are immutable.';
  END IF;
  RETURN NEW;
END;
$$;

-- The rendered-proof routine (20260811203245) hard-required the title/H1
-- source file and an exact title+heading proof, so a page_metadata request
-- could never transition to applied. Admit the page.metadata files and prove
-- the meta description when that is the approved change, keeping the
-- title/H1 path byte-for-byte as strict as before.
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
  v_expected_description text;
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
     OR v_row.source_file NOT IN (
       'src/pages/services/servicesData.ts',
       'src/components/seo/SeoHead.tsx',
       'src/components/seo/DefaultSeo.tsx'
     )
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
  -- carry exactly the approved wording recorded on this request.
  IF COALESCE(_proof->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'The supplied proof does not report a match.';
  END IF;

  v_final_url := COALESCE(_proof->>'finalUrl', '');
  IF v_final_url NOT LIKE 'https://trumoveinc.com/%' AND v_final_url <> 'https://trumoveinc.com' THEN
    RAISE EXCEPTION 'The supplied proof does not name the allowlisted public site.';
  END IF;

  SELECT c->>'after' INTO v_expected_description
    FROM jsonb_array_elements(v_row.changes) AS c
    WHERE c->>'field' = 'meta_description' LIMIT 1;

  IF v_expected_description IS NOT NULL THEN
    IF _proof->>'foundDescription' IS DISTINCT FROM v_expected_description THEN
      RAISE EXCEPTION 'The supplied proof does not contain the exact approved meta description.';
    END IF;
  ELSE
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
