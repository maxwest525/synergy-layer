-- Rename the title/H1 lane to what it actually is: page wording.
--
-- The lane edits the words on a page. Calling it `title_h1` made the first
-- lane built sound like the only kind of fix there is, and that name spread
-- into the proposal type, three functions, a trigger, the governed change
-- kind, and every file that touches drafting. The operator's standing
-- complaint that "the system keeps reverting to title and H1" is partly this
-- name asserting itself everywhere.
--
-- Renaming the value alone would break the running app, so this migration is
-- written to be SAFE IN EITHER DEPLOY ORDER -- code first or migration first:
--
--   * the CHECK constraint accepts BOTH names, so old code inserting
--     'title_h1' and new code inserting 'page_wording' both succeed;
--   * the measurement triggers gate on BOTH, so a cycle opens either way;
--   * `create_page_wording_proposal` and `revise_page_wording_proposal` are
--     created as thin wrappers over the existing functions rather than
--     renames, so both names resolve during the transition.
--
-- A follow-up migration narrows the constraint and drops the old names once
-- the deploy has settled. That cleanup is deliberately NOT in this file:
-- doing both at once is what would make this risky.

-- 1. Widen the constraint to accept both names.
ALTER TABLE public.change_requests
  DROP CONSTRAINT IF EXISTS change_requests_proposal_type_check;

ALTER TABLE public.change_requests
  ADD CONSTRAINT change_requests_proposal_type_check
  CHECK (proposal_type IN ('title_h1', 'page_wording', 'page_metadata', 'site.crawl_directives'));

-- 2. Move the stored rows.
--
-- `lock_approved_title_h1_content` refuses any change to `proposal_type` on a
-- row that has left the `proposed` state, and every stored row is approved,
-- applied or rolled back. The guard is doing its job; it just cannot tell a
-- rename from a tamper. Disabled for this statement only, and re-enabled
-- immediately, so no row can be edited while it is off.
ALTER TABLE public.change_requests DISABLE TRIGGER lock_approved_title_h1_content;

UPDATE public.change_requests
SET proposal_type = 'page_wording'
WHERE proposal_type = 'title_h1';

ALTER TABLE public.change_requests ENABLE TRIGGER lock_approved_title_h1_content;

-- 3. The measurement lifecycle triggers accept both names.
--    Bodies are otherwise identical to 20260828100000, which extended them to
--    page_metadata; only the gate changes here.
CREATE OR REPLACE FUNCTION public.capture_change_measurement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.proposal_type NOT IN ('title_h1', 'page_wording', 'page_metadata') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.live_at IS NOT NULL AND NEW.live_at IS DISTINCT FROM OLD.live_at THEN
    RAISE EXCEPTION 'The rendered live anchor is immutable.';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.published_proof_at IS NULL AND NEW.published_proof_at IS NOT NULL THEN
    NEW.live_at := NEW.published_proof_at;
  ELSIF TG_OP = 'UPDATE' AND OLD.live_at IS NULL AND NEW.live_at IS NOT NULL THEN
    RAISE EXCEPTION 'The live anchor can only be set by a rendered published proof.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.materialize_change_measurement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
  v_property text;
  v_approved_date date;
  v_live_date date;
BEGIN
  IF NEW.proposal_type NOT IN ('title_h1', 'page_wording', 'page_metadata') THEN RETURN NEW; END IF;
  IF NEW.approved_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.approved_at IS NULL) THEN
    SELECT site_url INTO v_property FROM public.search_console_properties WHERE tenant_id = NEW.tenant_id AND selected = true LIMIT 1;
    INSERT INTO public.change_measurement_cycles(tenant_id, change_request_id, target_url, gsc_property, approved_at, approval_snapshot)
    VALUES (NEW.tenant_id, NEW.id, NEW.target_url, v_property, NEW.approved_at,
      jsonb_build_object('changes', NEW.changes, 'evidence', NEW.evidence, 'generationContext', NEW.generation_context,
        'verificationBaseline', NEW.verification_baseline, 'sourceRevision', NEW.source_revision_before))
    ON CONFLICT (change_request_id) DO NOTHING RETURNING id INTO v_cycle_id;
    IF v_cycle_id IS NULL THEN SELECT id INTO v_cycle_id FROM public.change_measurement_cycles WHERE change_request_id = NEW.id; END IF;
    v_approved_date := (NEW.approved_at AT TIME ZONE 'America/Los_Angeles')::date;
    INSERT INTO public.change_measurement_windows(tenant_id, cycle_id, window_days, anchor_kind, period_start_pt, period_end_pt, available_after_pt)
    VALUES (NEW.tenant_id, v_cycle_id, 0, 'approval_baseline', v_approved_date - 28, v_approved_date - 1, v_approved_date)
    ON CONFLICT (cycle_id, window_days) DO NOTHING;
  END IF;
  IF NEW.live_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.live_at IS NULL) THEN
    SELECT id INTO v_cycle_id FROM public.change_measurement_cycles WHERE change_request_id = NEW.id;
    IF v_cycle_id IS NULL THEN RAISE EXCEPTION 'A rendered live anchor requires an immutable approval baseline.'; END IF;
    UPDATE public.change_measurement_cycles SET live_at = NEW.live_at WHERE id = v_cycle_id AND live_at IS NULL;
    v_live_date := (NEW.live_at AT TIME ZONE 'America/Los_Angeles')::date;
    INSERT INTO public.change_measurement_windows(tenant_id, cycle_id, window_days, anchor_kind, period_start_pt, period_end_pt, available_after_pt)
    VALUES
      (NEW.tenant_id, v_cycle_id, 14, 'rendered_live', v_live_date + 1, v_live_date + 14, v_live_date + 15),
      (NEW.tenant_id, v_cycle_id, 28, 'rendered_live', v_live_date + 1, v_live_date + 28, v_live_date + 29),
      (NEW.tenant_id, v_cycle_id, 56, 'rendered_live', v_live_date + 1, v_live_date + 56, v_live_date + 57),
      (NEW.tenant_id, v_cycle_id, 90, 'rendered_live', v_live_date + 1, v_live_date + 90, v_live_date + 91)
    ON CONFLICT (cycle_id, window_days) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. New names for the two proposal RPCs, as wrappers over the existing
--    bodies. Wrappers rather than ALTER FUNCTION ... RENAME so both names
--    resolve during the deploy window; the originals keep their own guards,
--    including the governed system-actor path added in 20260828090000.
CREATE OR REPLACE FUNCTION public.create_page_wording_proposal(
  _tenant_id uuid, _actor uuid, _idempotency_key text, _target_url text, _title text,
  _changes jsonb, _rationale text, _evidence jsonb, _evidence_summary text,
  _evidence_limitations text, _risk_note text, _generation_context jsonb,
  _source_repo text, _source_branch text, _source_file text, _source_project_id text,
  _source_revision_before text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.create_title_h1_proposal(
    _tenant_id, _actor, _idempotency_key, _target_url, _title, _changes, _rationale,
    _evidence, _evidence_summary, _evidence_limitations, _risk_note, _generation_context,
    _source_repo, _source_branch, _source_file, _source_project_id, _source_revision_before
  );
$$;

CREATE OR REPLACE FUNCTION public.revise_page_wording_proposal(
  _id uuid, _actor uuid, _revision_kind text, _changes jsonb, _rationale text,
  _evidence jsonb, _evidence_summary text, _evidence_limitations text, _risk_note text,
  _generation_context jsonb, _source_revision_before text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.revise_title_h1_proposal(
    _id, _actor, _revision_kind, _changes, _rationale, _evidence, _evidence_summary,
    _evidence_limitations, _risk_note, _generation_context, _source_revision_before
  );
$$;

REVOKE ALL ON FUNCTION public.create_page_wording_proposal(
  uuid, uuid, text, text, text, jsonb, text, jsonb, text, text, text, jsonb, text, text, text, text, text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revise_page_wording_proposal(
  uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_page_wording_proposal(
  uuid, uuid, text, text, text, jsonb, text, jsonb, text, text, text, jsonb, text, text, text, text, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revise_page_wording_proposal(
  uuid, uuid, text, jsonb, text, jsonb, text, text, text, jsonb, text
) TO authenticated, service_role;
