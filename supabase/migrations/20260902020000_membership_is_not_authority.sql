-- Membership is not authority, and approval locks every lane.
--
-- The 2026-09-02 database and security reviews (DB-3, DB-4, DB-5, DB-6, DB-7,
-- DB-8, DB-13, SEC-4, SEC-6, SEC-7; backlog CODE-35, CODE-39, CODE-40,
-- CODE-41, CODE-42, CODE-45) found the database trusting three things it
-- should not: tenant membership as if it were the operator role, the actor a
-- caller names as if it were the caller, and the anon role's default table
-- privileges as if the row policies were the only door. This file closes
-- those in one place. Every statement is idempotent; every data change names
-- the rows it touches and is undone by the statement given beside it. No
-- section drops a column or a row.

-- ---------------------------------------------------------------------------
-- 1. Approval locks every lane, not only the lane's old name.
--
-- The live function carried the 20260814080000 body, which guards
-- `proposal_type = 'title_h1'` only: 20260819213000 widened it in this
-- directory, but the ledger has no row for that file and the catalog cannot
-- say whether it ever ran. The effect was that the five approved page_wording
-- rows and the page_metadata row could be rewritten after approval. The
-- function keeps its name so the existing trigger keeps pointing at it.
-- Rollback: re-issue the 20260814080000 body.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. The revise routine serves the lane it is named for, and the actor is
--    the session.
--
-- `revise_title_h1_proposal` refused every proposal_type but 'title_h1', and
-- since 20260828140000 nothing is stored under that name, so
-- `revise_page_wording_proposal` (a wrapper over it) could never succeed and
-- `change_request_versions` has never received a row. The guard now names
-- 'page_wording'. Both the create and the revise routine also bind `_actor`
-- to `auth.uid()` whenever a session is present, and the null-actor system
-- path is reserved for the server (no session). The two wrappers are
-- executable by the service role only: every application caller goes
-- through `serviceRpc` (the admin client), and the operator and tenant are
-- asserted in the server function before the call.
-- Rollback: re-issue the bodies from 20260828160000 and re-grant EXECUTE on
-- the two wrappers to authenticated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_title_h1_proposal(
  _tenant_id uuid, _actor uuid, _idempotency_key text, _target_url text, _title text,
  _changes jsonb, _rationale text, _evidence jsonb, _evidence_summary text,
  _evidence_limitations text, _risk_note text, _generation_context jsonb,
  _source_repo text, _source_branch text, _source_file text, _source_project_id text,
  _source_revision_before text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_change public.change_requests%ROWTYPE;
  v_inbox uuid;
  v_bad_field text;
BEGIN
  IF _actor IS NULL THEN
    -- The governed system path (the nightly propose-from-evidence job). It
    -- is the server's, so a caller with a session cannot borrow it.
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'The system proposal path is reserved for the server.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) THEN
      RAISE EXCEPTION 'That tenant is not visible to this account.';
    END IF;
  ELSE
    IF auth.uid() IS NOT NULL AND _actor IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'A proposal is drafted as the signed-in account, not on its behalf.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant_id AND user_id = _actor
    ) THEN
      RAISE EXCEPTION 'That tenant is not visible to this account.';
    END IF;
    IF NOT (public.has_role(_actor, 'admin'::app_role) OR public.has_role(_actor, 'operator'::app_role)) THEN
      RAISE EXCEPTION 'Only an operator or admin can generate a proposal.';
    END IF;
  END IF;

  IF jsonb_array_length(_changes) < 1 THEN
    RAISE EXCEPTION 'A page wording proposal requires at least one exact change.';
  END IF;
  IF jsonb_array_length(_evidence) <> 3 THEN
    RAISE EXCEPTION 'A page wording proposal requires three evidence classes.';
  END IF;

  SELECT c->>'field' INTO v_bad_field
  FROM jsonb_array_elements(_changes) AS c
  WHERE NOT public.page_wording_field_is_owned(c->>'field') LIMIT 1;
  IF v_bad_field IS NOT NULL THEN
    RAISE EXCEPTION 'The page wording lane does not own the field "%".', v_bad_field;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_changes) AS c
    WHERE COALESCE(c->>'before', '') = '' OR COALESCE(c->>'after', '') = ''
  ) THEN
    RAISE EXCEPTION 'Every wording change must record the exact text before and after.';
  END IF;

  SELECT * INTO v_change FROM public.change_requests
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
    jsonb_build_object('targetUrl', _target_url, 'revisionCount', 0, 'proposalType', 'page_wording',
      'fields', (SELECT jsonb_agg(c->>'field') FROM jsonb_array_elements(_changes) AS c))
  );

  RETURN jsonb_build_object('changed', true, 'change_request', to_jsonb(v_change));
END;
$function$;

CREATE OR REPLACE FUNCTION public.revise_title_h1_proposal(
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
  IF _revision_kind NOT IN ('edit', 'regenerate') THEN
    RAISE EXCEPTION 'Only edit or regenerate may create a proposal version.';
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
  IF v_change.proposal_type <> 'page_wording' THEN
    RAISE EXCEPTION 'Only a page wording proposal can be revised here.';
  END IF;
  IF v_change.state <> 'proposed' THEN
    RAISE EXCEPTION 'Approved proposals are immutable; start a new draft.';
  END IF;
  IF jsonb_array_length(_changes) < 1 OR jsonb_array_length(_evidence) <> 3 THEN
    RAISE EXCEPTION 'A page wording proposal requires at least one exact change and three evidence classes.';
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
      'Revision %s was created by %s. Review the exact wording, evidence, and source baseline.',
      v_version, _revision_kind
    )
  WHERE id = v_change.inbox_item_id;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    v_change.tenant_id, 'user', _actor::text, 'page_wording.' || _revision_kind,
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

REVOKE EXECUTE ON FUNCTION public.create_page_wording_proposal(
  uuid, uuid, text, text, text, jsonb, text, jsonb, text, text, text, jsonb, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revise_page_wording_proposal(
  uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_page_wording_proposal(
  uuid, uuid, text, text, text, jsonb, text, jsonb, text, text, text, jsonb, text, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.revise_page_wording_proposal(
  uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The one row still filed under the old lane name moves, and the
--    constraint closes behind it.
--
-- 20260828140000 moved every row it could see; f8feacee-05e8-4f0c-a2d1-
-- 120d43bf7348 (approved 2026-08-28 23:56 UTC) was filed by the old code a
-- few minutes after that migration ran, in the deploy window the file was
-- written to survive. It is approved, so the guard from section 1 refuses
-- the rename; the trigger is off for this one statement and on again
-- immediately, the same way 20260828140000 did it.
-- Rollback: the reverse UPDATE under the same trigger switch, then the
-- four-value CHECK from 20260828140000.
-- ---------------------------------------------------------------------------
ALTER TABLE public.change_requests DISABLE TRIGGER lock_approved_title_h1_content;

UPDATE public.change_requests
SET proposal_type = 'page_wording'
WHERE proposal_type = 'title_h1';

ALTER TABLE public.change_requests ENABLE TRIGGER lock_approved_title_h1_content;

ALTER TABLE public.change_requests
  DROP CONSTRAINT IF EXISTS change_requests_proposal_type_check;

ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_proposal_type_check
  CHECK (proposal_type IN ('page_wording', 'page_metadata', 'site.crawl_directives'));

-- ---------------------------------------------------------------------------
-- 4. Write paths that checked membership alone now require the operator
--    role, and the actor is the session.
--
-- A viewer-role member could advance a workflow run, reassign who owns a
-- concern, seed concerns, and append measurement evidence by calling the
-- routines directly. `claim_workflow_run_step` also recorded whatever actor
-- the caller named.
-- Rollback: re-issue the prior bodies (20260817032044 for the run claim;
-- the two concern routines are defined in no file in this directory, their
-- 2026-09-02 bodies are recorded in DEPLOYMENT_TOPOLOGY.md §3) and re-grant
-- EXECUTE on the two measurement routines to authenticated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_workflow_run_step(p_run_id uuid, p_actor uuid)
RETURNS TABLE(run_id uuid, step_cursor integer, total_steps integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run public.workflow_runs%ROWTYPE;
  v_actor uuid;
BEGIN
  SELECT * INTO v_run FROM public.workflow_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found';
  END IF;

  -- With a session, the session is the actor and must be an operator of the
  -- run's workspace. Without one (the scheduler, through the service role),
  -- the caller names the actor.
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_tenant_member(v_run.tenant_id) OR NOT public.is_operator() THEN
      RAISE EXCEPTION 'Only an operator or admin of this workspace can advance a run';
    END IF;
    v_actor := auth.uid();
  ELSE
    v_actor := p_actor;
  END IF;

  -- A run left in 'running' by a crashed step is recoverable only after it has
  -- clearly stopped moving. Anything sooner could double-execute a live step.
  IF v_run.state = 'running'
     AND (v_run.last_advanced_at IS NULL OR v_run.last_advanced_at > now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'This run is already advancing a step';
  END IF;

  IF v_run.state NOT IN ('queued','awaiting_approval','running') THEN
    RAISE EXCEPTION 'Run is % and cannot be advanced', v_run.state;
  END IF;
  IF v_run.cursor >= v_run.total_steps THEN
    RAISE EXCEPTION 'Run has no remaining steps';
  END IF;

  UPDATE public.workflow_runs
     SET state = 'running',
         last_advanced_at = now(),
         last_advanced_by = v_actor,
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE id = p_run_id;

  run_id := v_run.id;
  step_cursor := v_run.cursor;
  total_steps := v_run.total_steps;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_concern_ownership(p_concern_id uuid, p_owner_name text, p_target_date date)
RETURNS public.essential_concerns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.essential_concerns;
  v_owner text;
BEGIN
  SELECT * INTO v_row FROM public.essential_concerns WHERE id = p_concern_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That concern is not visible to this account.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id = v_row.tenant_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'That concern is not visible to this account.';
  END IF;
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Only an operator or admin can set who owns a concern.';
  END IF;

  v_owner := nullif(btrim(coalesce(p_owner_name, '')), '');

  UPDATE public.essential_concerns
     SET owner_name = v_owner,
         target_date = p_target_date,
         updated_at = now()
   WHERE id = p_concern_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.seed_essential_concerns_for_tenant(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inserted integer;
BEGIN
  -- The server (no session) may seed any workspace; a session must belong
  -- to an operator of this one.
  IF auth.uid() IS NOT NULL
     AND NOT (public.is_tenant_member(p_tenant_id) AND public.is_operator()) THEN
    RAISE EXCEPTION 'Only an operator or admin of this workspace can seed its concerns.';
  END IF;

  INSERT INTO public.essential_concerns (tenant_id, key, phase, task, description, sort_order)
  SELECT p_tenant_id, t.key, t.phase, t.task, t.description, t.sort_order
  FROM public.essential_concern_templates t
  ON CONFLICT (tenant_id, key) DO NOTHING;

  GET DIAGNOSTICS inserted = row_count;
  RETURN inserted;
END;
$function$;

-- Measurement evidence is appended by the server alone (change-measurements
-- .server.ts through the admin client); no session ever calls these.
REVOKE EXECUTE ON FUNCTION public.append_change_measurement_observation(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_change_measurement_revision(
  uuid, uuid, uuid, text, text, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_change_measurement_observation(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.append_change_measurement_revision(
  uuid, uuid, uuid, text, text, jsonb
) TO service_role;

-- The page audit writes these two tables through the operator's own session,
-- and the server function asserts the operator role first; the policies now
-- say the same thing.
DROP POLICY IF EXISTS "Tenant members record page metadata observations" ON public.page_metadata_observations;
CREATE POLICY "Operators record page metadata observations"
  ON public.page_metadata_observations FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "Tenant members record site audit snapshots" ON public.site_audit_snapshots;
CREATE POLICY "Operators record site audit snapshots"
  ON public.site_audit_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_operator() AND public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 5. Provisioning creates a membership.
--
-- `provision_operator_from_allowlist` wrote a profile and a role and never a
-- `tenant_members` row. One of the two admins has a role, no membership and
-- no active workspace, and works only because `is_tenant_member` short-
-- circuits on the global admin role and `resolveTenantId` falls back to the
-- sole tenant. The next allow-listed operator who is not an admin would see
-- zero rows everywhere. The allow-list now names the workspace an entry
-- belongs to; when it names none and the installation has exactly one
-- tenant, that tenant is used (the same fallback the server already makes);
-- when it names none and there are several, the role is still granted and
-- an activity event says no workspace was joined.
-- Rollback: `ALTER TABLE public.authorized_operators DROP COLUMN tenant_id`
-- and re-issue the 20260805042520 body; the backfilled membership rows are
-- listed by `SELECT * FROM public.tenant_members WHERE created_at >= '2026-09-02'`.
-- ---------------------------------------------------------------------------
ALTER TABLE public.authorized_operators
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.authorized_operators.tenant_id IS
  'The client workspace this allow-list entry joins on provisioning. Null with exactly one tenant means that tenant; null with several means the role is granted and no workspace is joined.';

-- Backfill, valid only while the installation has exactly one tenant: every
-- entry that names no workspace joins the one that exists.
UPDATE public.authorized_operators ao
SET tenant_id = t.id
FROM (SELECT id FROM public.tenants) t
WHERE ao.tenant_id IS NULL
  AND (SELECT count(*) FROM public.tenants) = 1;

CREATE OR REPLACE FUNCTION public.provision_operator_from_allowlist(_auth_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_verified timestamptz;
  v_norm text;
  v_allow public.app_role;
  v_tenant uuid;
  v_current public.app_role;
  rank_new integer;
  rank_cur integer;
BEGIN
  SELECT email, email_confirmed_at INTO v_email, v_verified FROM auth.users WHERE id = _auth_user_id;
  IF v_email IS NULL THEN RETURN 'unknown_user'; END IF;

  v_norm := public.normalize_email(v_email);

  INSERT INTO public.profiles (id, email, email_normalized)
  VALUES (_auth_user_id, v_email, v_norm)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, email_normalized = EXCLUDED.email_normalized;

  IF v_verified IS NULL THEN
    INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
    VALUES ('system', _auth_user_id::text, 'auth.provision_skipped', 'user', _auth_user_id,
            'Provisioning skipped: email is not verified.', jsonb_build_object('reason','unverified_email'));
    RETURN 'unverified';
  END IF;

  SELECT role, tenant_id INTO v_allow, v_tenant FROM public.authorized_operators
  WHERE email_normalized = v_norm AND revoked_at IS NULL;

  IF v_allow IS NULL THEN
    INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
    VALUES ('system', _auth_user_id::text, 'auth.access_denied', 'user', _auth_user_id,
            'Sign-in succeeded but the account is not on the operator allowlist.',
            jsonb_build_object('reason','not_allowlisted'));
    RETURN 'not_allowlisted';
  END IF;

  -- The workspace this entry joins: the one it names, else the sole tenant.
  IF v_tenant IS NULL AND (SELECT count(*) FROM public.tenants) = 1 THEN
    SELECT id INTO v_tenant FROM public.tenants;
  END IF;

  IF v_tenant IS NOT NULL THEN
    INSERT INTO public.tenant_members (tenant_id, user_id, role)
    VALUES (v_tenant, _auth_user_id, v_allow)
    ON CONFLICT (tenant_id, user_id) DO NOTHING;
    UPDATE public.profiles SET active_tenant_id = v_tenant
    WHERE id = _auth_user_id AND active_tenant_id IS NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = _auth_user_id) THEN
    INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
    VALUES ('system', _auth_user_id::text, 'auth.provisioned_without_workspace', 'user', _auth_user_id,
            'The allow-list entry names no client workspace and there are several, so no membership was created.',
            jsonb_build_object('reason','no_tenant_on_allowlist'));
  END IF;

  SELECT role INTO v_current FROM public.user_roles WHERE user_id = _auth_user_id
  ORDER BY CASE role WHEN 'admin' THEN 3 WHEN 'operator' THEN 2 ELSE 1 END DESC LIMIT 1;

  rank_new := CASE v_allow WHEN 'admin' THEN 3 WHEN 'operator' THEN 2 ELSE 1 END;
  rank_cur := CASE v_current WHEN 'admin' THEN 3 WHEN 'operator' THEN 2 ELSE 1 END;

  IF v_current IS NOT NULL AND rank_cur >= rank_new THEN
    RETURN 'unchanged';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _auth_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (_auth_user_id, v_allow)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.activity_events (actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
  VALUES ('system', _auth_user_id::text, 'auth.operator_provisioned', 'user', _auth_user_id,
          format('Operator access provisioned as %s.', v_allow),
          jsonb_build_object('role', v_allow, 'tenantId', v_tenant));

  RETURN 'provisioned:' || v_allow::text;
END $function$;

-- Backfill for accounts already provisioned: every allow-listed, role-holding
-- account joins the workspace its entry names, and an account with no active
-- workspace takes the one it just joined.
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT ao.tenant_id, p.id, ur.role
FROM public.authorized_operators ao
JOIN public.profiles p ON p.email_normalized = ao.email_normalized
JOIN public.user_roles ur ON ur.user_id = p.id
WHERE ao.revoked_at IS NULL AND ao.tenant_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO NOTHING;

UPDATE public.profiles p
SET active_tenant_id = m.tenant_id
FROM public.tenant_members m
WHERE m.user_id = p.id AND p.active_tenant_id IS NULL;

-- ---------------------------------------------------------------------------
-- 6. The active workspace on a profile must be one the account belongs to.
--
-- `profiles_update_self` lets an account update any column of its own row,
-- and the foreign key only needs the tenant to exist, so an operator of
-- workspace A could point `active_tenant_id` at workspace B and have every
-- service-role-backed write land there. Latent with one tenant; live with
-- the second. Section 5 gives every current account the membership this
-- trigger requires, so the backfill above runs before it exists.
-- Rollback: DROP TRIGGER profiles_active_tenant_requires_membership.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refuse_foreign_active_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.active_tenant_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.active_tenant_id IS DISTINCT FROM OLD.active_tenant_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.tenant_members m
       WHERE m.tenant_id = NEW.active_tenant_id AND m.user_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'That client workspace is not available to this account.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_active_tenant_requires_membership ON public.profiles;
CREATE TRIGGER profiles_active_tenant_requires_membership
  BEFORE INSERT OR UPDATE OF active_tenant_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.refuse_foreign_active_tenant();

-- ---------------------------------------------------------------------------
-- 7. The three vendor schedules stop claiming to be on.
--
-- `sch.vendor_ad_refresh`, `sch.vendor_landing_page_analysis` and
-- `sch.vendor_message_synthesis` were switched to enabled at
-- 2026-08-28 20:50 UTC by something outside the app (no migration, no
-- activity event), have never run, have a `next_run_at` in the past, no cron
-- entry, and both scheduler callers pass an allow-list they are not on. A
-- control that reads "on" with nothing behind it is a lying control; the
-- first tick without an allow-list would run a metered SerpAPI refresh with
-- no click. Off, with the reason on the activity feed. Enabling them again
-- is an operator decision that comes with a cron entry, the tick allow-list
-- and the cost on the control (BACKLOG CODE-42).
-- Rollback: the reverse UPDATE on the same three keys.
-- ---------------------------------------------------------------------------
INSERT INTO public.activity_events (tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
SELECT s.tenant_id, 'system', 'migration:20260902020000', 'schedule.disabled', 'schedule', s.id,
       s.key || ': switched off. It read enabled since 2026-08-28 with no cron entry and no tick allow-listing it, so it could never run.',
       jsonb_build_object('key', s.key, 'previousNextRunAt', s.next_run_at, 'reason', 'enabled_with_nothing_firing_it')
FROM public.schedules s
WHERE s.key IN ('sch.vendor_ad_refresh', 'sch.vendor_landing_page_analysis', 'sch.vendor_message_synthesis')
  AND s.enabled = true
  AND s.last_run_at IS NULL;

UPDATE public.schedules
SET enabled = false, next_run_at = NULL, updated_at = now()
WHERE key IN ('sch.vendor_ad_refresh', 'sch.vendor_landing_page_analysis', 'sch.vendor_message_synthesis')
  AND enabled = true
  AND last_run_at IS NULL;

-- ---------------------------------------------------------------------------
-- 8. The anon role loses its default table privileges; authenticated loses
--    the three it never needs.
--
-- Every table created by a migration inherited the platform's default
-- grants: anon could SELECT/INSERT/UPDATE/DELETE on 61 tables and
-- authenticated held TRUNCATE (which row policies do not govern) on 75,
-- `change_requests` included. Row policies were the only barrier, and one
-- future `USING (true)` policy without a `TO` clause (as 20260805042451
-- once shipped) would open that table to the internet. No code path uses
-- the anon role against a public table: the browser client before sign-in
-- talks to auth alone, and every public hook uses the service role. The
-- default privileges are altered for the role that owns every public table
-- (postgres, the role migrations run as), so the next table starts closed.
-- Rollback: GRANT the same privileges back and reverse the two ALTER
-- DEFAULT PRIVILEGES statements.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- ---------------------------------------------------------------------------
-- 9. The next rendered proof must not fail on its own measurement windows.
--
-- Found while verifying the ledger: the live
-- `materialize_change_measurement_lifecycle` (20260828140000, applied)
-- inserts 14, 28, 56 and 90-day windows when a change goes live, but the
-- live CHECK on `change_measurement_windows.window_days` still admits only
-- 0, 7, 14 and 28: 20260820200000 widened it in this directory and never
-- ran. The first proof recorded since would have raised inside the trigger
-- and rolled the whole `apply_change_request_rendered_proof` call back, with
-- five approved changes waiting on exactly that step. Same two statements as
-- 20260820200000: widen the CHECK, then give the one live cycle the two
-- windows it is missing.
-- Rollback: the four-value CHECK; the two backfilled rows are the 56 and
-- 90-day windows of the cycle whose live_at is 2026-08-14.
-- ---------------------------------------------------------------------------
ALTER TABLE public.change_measurement_windows
  DROP CONSTRAINT IF EXISTS change_measurement_windows_window_days_check;
ALTER TABLE public.change_measurement_windows
  ADD CONSTRAINT change_measurement_windows_window_days_check
  CHECK (window_days IN (0, 7, 14, 28, 56, 90));

INSERT INTO public.change_measurement_windows(
  tenant_id, cycle_id, window_days, anchor_kind, period_start_pt, period_end_pt, available_after_pt
)
SELECT
  cycle.tenant_id,
  cycle.id,
  span.window_days,
  'rendered_live',
  ((cycle.live_at AT TIME ZONE 'America/Los_Angeles')::date) + 1,
  ((cycle.live_at AT TIME ZONE 'America/Los_Angeles')::date) + span.window_days,
  ((cycle.live_at AT TIME ZONE 'America/Los_Angeles')::date) + span.window_days + 1
FROM public.change_measurement_cycles AS cycle
CROSS JOIN (VALUES (56), (90)) AS span(window_days)
WHERE cycle.live_at IS NOT NULL
ON CONFLICT (cycle_id, window_days) DO NOTHING;
