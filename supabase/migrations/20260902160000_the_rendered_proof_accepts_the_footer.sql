-- The rendered proof routine accepts the sitewide footer (CODE-90)
--
-- 49 CFR § 371.107(c) requires a household goods broker to state that the
-- carrier's charges are determined by its published tariff. The site carries
-- every other part of that statement and not this one, and the sentence lives
-- in src/components/trumove/Footer.tsx -- one file, rendered on every page,
-- owned by no governed change kind until now.
--
-- The executor's file allowlist and this routine's are separate lists that
-- cannot see each other (src/lib/execution/proof-target-allowlist.test.ts is
-- what keeps them equal). Adding the file on the TypeScript side alone would
-- let the executor commit a change the database then refused to record, so the
-- two move in the same change.
--
-- Nothing else in the routine changes: the repository, branch and source
-- project pins, the state machine and the proof requirements are copied
-- verbatim from 20260828160000.

-- The wording lane owns one more field.
--
-- `broker_statement` is the sentence in the sitewide footer. It is owned for
-- the same reason `subheading` was: a field the proposal writer will not accept
-- cannot be proposed, and a field this list omits cannot be proven, so the
-- executor would commit a change no row could ever move to applied.
--
-- Like `subheading`, it is counted here and matched by the rendered verifier
-- rather than re-checked by value in SQL: the value is a sentence inside the
-- page's text, and this routine reads only the individual fields the proof
-- reports (foundTitle, foundHeading, foundDescription).
CREATE OR REPLACE FUNCTION public.page_wording_field_is_owned(_field text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _field IN ('seo_title', 'page_heading', 'subheading', 'broker_statement');
$$;

REVOKE ALL ON FUNCTION public.page_wording_field_is_owned(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.page_wording_field_is_owned(text) TO authenticated, service_role;

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
       'src/components/trumove/Footer.tsx',
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
