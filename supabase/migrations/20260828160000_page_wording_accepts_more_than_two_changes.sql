-- Let the page wording lane edit more than a title and an H1.
--
-- The operator's standing complaint for months has been that "the system keeps
-- only reverting to title and H1". That was never a preference or a default
-- that could be argued with. It was a hard constraint, written into four
-- layers, and every previous fix landed above the two that mattered:
--
--   1. the generator emitted exactly two changes, `seo_title` and
--      `page_heading` (src/lib/page-wording-proposals.ts);
--   2. THIS FUNCTION refused anything that was not exactly two changes --
--      `IF jsonb_array_length(_changes) <> 2 ... RAISE EXCEPTION`, from
--      20260814080000. Not a floor. An equality. A subheading fix, a body
--      rewrite, one change, three changes: all rejected by the database;
--   3. `apply_change_request_rendered_proof` looked up `seo_title` and
--      `page_heading` by name to prove a change went live, so nothing else
--      could be proven even if it got in;
--   4. `verifyRenderedPage` in TypeScript refused any change that did not
--      carry both fields ("does not store both an SEO title and a page
--      heading to prove").
--
-- Layer 4 is fixed in the same change as this file, and layer 1 follows.
-- This migration is layers 2 and 3.
--
-- Renaming the lane to `page_wording` (20260828140000) did not touch any of
-- this. It gave a title-and-H1 editor a name that says "page wording", which
-- made the real limit harder to see rather than easier.
--
-- What replaces the count check is not "no check". A change set must still be
-- non-empty, and every field in it must be one this lane owns and a rendered
-- page can be asked about. An unbounded change set would let an approval
-- authorise edits the operator never read, which is the thing the original
-- `= 2` was crudely protecting against. The protection is kept; the arbitrary
-- number is not.

-- 1. The owned field set, in one place, so the create path and the proof path
--    cannot drift. `subheading` is new and is provable because RenderedPage now
--    carries every H2 on the page.
CREATE OR REPLACE FUNCTION public.page_wording_field_is_owned(_field text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _field IN ('seo_title', 'page_heading', 'subheading');
$$;

REVOKE ALL ON FUNCTION public.page_wording_field_is_owned(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.page_wording_field_is_owned(text) TO authenticated, service_role;

-- 2. Creation accepts one or more owned changes instead of exactly two.
--    Body is otherwise identical to 20260828090000, which added the governed
--    system-actor path; only the change-set validation differs.
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
  v_bad_field text;
BEGIN
  IF _actor IS NULL THEN
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

  -- One or more owned changes, and the three evidence classes as before.
  IF jsonb_array_length(_changes) < 1 THEN
    RAISE EXCEPTION 'A page wording proposal requires at least one exact change.';
  END IF;
  IF jsonb_array_length(_evidence) <> 3 THEN
    RAISE EXCEPTION 'A page wording proposal requires three evidence classes.';
  END IF;

  SELECT c->>'field' INTO v_bad_field
  FROM jsonb_array_elements(_changes) AS c
  WHERE NOT public.page_wording_field_is_owned(c->>'field')
  LIMIT 1;
  IF v_bad_field IS NOT NULL THEN
    RAISE EXCEPTION 'The page wording lane does not own the field "%".', v_bad_field;
  END IF;

  -- Every change must carry both sides of the replacement, or the executor has
  -- nothing to match on and the proof has nothing to compare.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_changes) AS c
    WHERE COALESCE(c->>'before', '') = '' OR COALESCE(c->>'after', '') = ''
  ) THEN
    RAISE EXCEPTION 'Every wording change must record the exact text before and after.';
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
    _tenant_id, _idempotency_key, _title, 'proposed', 'page_wording', _target_url,
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
    _tenant_id, 'pending_approval', 'page-wording-proposals', 'change_request', v_change.id,
    'Review page wording proposal: ' || _title,
    'Review the exact wording, evidence, and source baseline. Approval authorizes only the changes listed on this request.',
    1,
    jsonb_build_array(jsonb_build_object(
      'kind', 'review', 'label', 'Review page wording proposal', 'href', '/changes/' || v_change.id::text
    )),
    jsonb_build_object('proposalType', 'page_wording', 'category', 'change_request')
  ) RETURNING id INTO v_inbox;

  UPDATE public.change_requests SET inbox_item_id = v_inbox WHERE id = v_change.id
  RETURNING * INTO v_change;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    _tenant_id,
    CASE WHEN _actor IS NULL THEN 'system' ELSE 'user' END,
    CASE WHEN _actor IS NULL THEN 'propose-from-evidence' ELSE _actor::text END,
    'page_wording.generated', 'change_request', v_change.id,
    _title || ': draft page wording proposal generated.',
    jsonb_build_object(
      'targetUrl', _target_url,
      'revisionCount', 0,
      'proposalType', 'page_wording',
      'fields', (SELECT jsonb_agg(c->>'field') FROM jsonb_array_elements(_changes) AS c)
    )
  );

  RETURN jsonb_build_object('changed', true, 'change_request', to_jsonb(v_change));
END;
$$;

-- 3. Revision accepts the same shape. Same guard, same reasoning.
DO $$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'revise_title_h1_proposal' LIMIT 1;
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'revise_title_h1_proposal is missing; refusing to guess its body.';
  END IF;
  IF position('jsonb_array_length(_changes) <> 2' in v_src) = 0 THEN
    RAISE NOTICE 'revise_title_h1_proposal no longer carries the two-change equality; leaving it as is.';
  ELSE
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.revise_title_h1_proposal(
         _id uuid, _actor uuid, _revision_kind text, _changes jsonb, _rationale text,
         _evidence jsonb, _evidence_summary text, _evidence_limitations text, _risk_note text,
         _generation_context jsonb, _source_revision_before text
       ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      replace(
        replace(
          v_src,
          'jsonb_array_length(_changes) <> 2 OR jsonb_array_length(_evidence) <> 3',
          'jsonb_array_length(_changes) < 1 OR jsonb_array_length(_evidence) <> 3'
        ),
        'A title/H1 proposal requires two exact changes and three evidence classes.',
        'A page wording proposal requires at least one exact change and three evidence classes.'
      )
    );
  END IF;
END $$;

-- 4. The published proof verifies whichever owned fields the row carries,
--    instead of demanding `seo_title` and `page_heading` by name.
--
--    The TypeScript side (verifyRenderedPage) does the comparison against the
--    rendered page; this routine re-checks the claim's internal consistency,
--    the same trust level as before. The robots and meta-description branches
--    are unchanged.
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
  v_expected_description text;
  v_final_url text;
  v_robots_lane boolean;
  v_wording_fields int;
  v_unproven text;
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

  IF v_row.source_repo IS DISTINCT FROM 'maxwest525/brittmove-829a7519'
     OR v_row.source_branch IS DISTINCT FROM 'main'
     OR v_row.source_file NOT IN (
       'src/pages/services/servicesData.ts',
       'src/components/seo/SeoHead.tsx',
       'src/components/seo/DefaultSeo.tsx',
       'public/robots.txt',
       'public/sitemap.xml',
       'src/platform/content/schema/index.ts',
       'src/pages/blog/posts.ts',
       'src/pages/Index.tsx',
       'src/pages/WhyTruMovePage.tsx',
       'src/pages/SafetyWebPage.tsx',
       'src/pages/CarrierApprovalPage.tsx',
       'src/pages/InventoryBuilderPage.tsx',
       'src/pages/RoutePlanningPage.tsx',
       'src/pages/ContactPage.tsx',
       'src/pages/FranchisePage.tsx',
       'src/pages/CareersPage.tsx',
       'src/pages/ServicesPage.tsx',
       'src/pages/blog/BlogIndexPage.tsx',
       'src/pages/research/ResearchIndexPage.tsx',
       'src/pages/resources/MovingCostEstimatorPage.tsx',
       'src/pages/legal/TermsPage.tsx',
       'src/pages/legal/PrivacyPage.tsx',
       'src/pages/legal/SmsPolicyPage.tsx',
       'src/pages/legal/CompliancePage.tsx',
       'src/pages/legal/AccessibilityPage.tsx'
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

  IF COALESCE(_proof->>'ok', 'false') <> 'true' THEN
    RAISE EXCEPTION 'The supplied proof does not report a match.';
  END IF;

  v_final_url := COALESCE(_proof->>'finalUrl', '');
  IF v_final_url NOT LIKE 'https://trumoveinc.com/%' AND v_final_url <> 'https://trumoveinc.com' THEN
    RAISE EXCEPTION 'The supplied proof does not name the allowlisted public site.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_row.changes) AS c WHERE c->>'field' = 'robots_txt'
  ) INTO v_robots_lane;

  IF v_robots_lane THEN
    IF _proof->>'matchedCommitSha' IS DISTINCT FROM v_row.source_commit_sha THEN
      RAISE EXCEPTION 'The supplied robots proof does not name the recorded source commit.';
    END IF;
    IF length(COALESCE(_proof->>'deployedSha256', '')) <> 64
       OR _proof->>'deployedSha256' IS DISTINCT FROM _proof->>'committedSha256' THEN
      RAISE EXCEPTION 'The supplied proof does not show the deployed robots.txt matching the committed file.';
    END IF;
  ELSE
    SELECT c->>'after' INTO v_expected_description
      FROM jsonb_array_elements(v_row.changes) AS c
      WHERE c->>'field' = 'meta_description' LIMIT 1;

    IF v_expected_description IS NOT NULL THEN
      IF _proof->>'foundDescription' IS DISTINCT FROM v_expected_description THEN
        RAISE EXCEPTION 'The supplied proof does not contain the exact approved meta description.';
      END IF;
    ELSE
      -- Wording lane. Every owned field on the row must be proven, and the two
      -- the rendered proof reports individually are re-checked here by value.
      SELECT count(*) INTO v_wording_fields
        FROM jsonb_array_elements(v_row.changes) AS c
        WHERE public.page_wording_field_is_owned(c->>'field');

      IF v_wording_fields = 0 THEN
        RAISE EXCEPTION 'This change request stores no wording field to prove.';
      END IF;

      SELECT c->>'field' INTO v_unproven
        FROM jsonb_array_elements(v_row.changes) AS c
        WHERE c->>'field' = 'seo_title'
          AND _proof->>'foundTitle' IS DISTINCT FROM c->>'after'
        LIMIT 1;
      IF v_unproven IS NOT NULL THEN
        RAISE EXCEPTION 'The supplied proof does not contain the exact approved title.';
      END IF;

      SELECT c->>'field' INTO v_unproven
        FROM jsonb_array_elements(v_row.changes) AS c
        WHERE c->>'field' = 'page_heading'
          AND _proof->>'foundHeading' IS DISTINCT FROM c->>'after'
        LIMIT 1;
      IF v_unproven IS NOT NULL THEN
        RAISE EXCEPTION 'The supplied proof does not contain the exact approved heading.';
      END IF;
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
    v_row.title || ': from approved to applied, proven live on the public site.',
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
