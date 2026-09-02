-- Approving a second change to a page while an earlier one is still in flight
-- used to be silent. On 2026-09-01 one page carried two approved title changes
-- and another had a second change approved inside the first one's 28-day
-- measurement window; both outcomes became unattributable and the operator
-- found out by asking (BACKLOG.md CODE-31).
--
-- The transition now refuses to approve while a sibling change to the same
-- page is approved-and-not-live, or live with a measurement window whose rows
-- are not readable yet, unless the caller acknowledges it explicitly. The
-- acknowledgement is recorded on the audit event, so a deliberate double
-- approval is a decision on the record rather than an accident.
--
-- The parameter list changes, so the previous signature is dropped first:
-- leaving it in place would make a two-argument RPC call ambiguous between
-- the two overloads.
DROP FUNCTION IF EXISTS public.transition_change_request(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.transition_change_request(
  _id uuid,
  _action text,
  _notes text DEFAULT NULL,
  _revision text DEFAULT NULL,
  _acknowledge_in_flight boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.change_requests%ROWTYPE;
  v_from text;
  v_to text;
  v_now timestamptz := now();
  v_rec_state text;
  v_has_evidence boolean;
  v_revert_sha text;
  v_sibling public.change_requests%ROWTYPE;
  v_sibling_words text;
  v_today_pt date := (now() AT TIME ZONE 'America/Los_Angeles')::date;
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
    RAISE EXCEPTION 'Only an operator or admin can decide a change request.';
  END IF;

  -- Captured before any write so the audit event can state old and new.
  v_from := v_row.state;

  v_to := CASE _action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'mark_applied' THEN 'applied'
    WHEN 'verify' THEN 'verified'
    WHEN 'roll_back' THEN 'rolled_back'
    ELSE NULL
  END;
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised action: %', _action;
  END IF;

  -- Replay of a completed transition: true no-op, no second activity event.
  IF v_from = v_to THEN
    RETURN jsonb_build_object('changed', false, 'change_request', to_jsonb(v_row));
  END IF;

  IF NOT (
    (v_from = 'proposed' AND _action IN ('approve','reject')) OR
    (v_from = 'approved' AND _action = 'mark_applied') OR
    (v_from = 'applied' AND _action IN ('verify','roll_back')) OR
    (v_from = 'verified' AND _action = 'roll_back')
  ) THEN
    RAISE EXCEPTION 'A change request that is % cannot move to %.', v_from, v_to;
  END IF;

  -- A sibling change to the same page that is approved and not yet live, or
  -- live with a measurement window still waiting on rows, shares this page's
  -- Search Console rows with whatever is approved now. Same rule as
  -- src/lib/change-request-conflicts.ts, which shows it before the click.
  IF _action = 'approve' THEN
    SELECT s.* INTO v_sibling
    FROM public.change_requests s
    WHERE s.tenant_id = v_row.tenant_id
      AND s.target_url = v_row.target_url
      AND s.id <> v_row.id
      AND (
        s.state = 'approved'
        OR (
          s.state = 'applied'
          AND EXISTS (
            SELECT 1
            FROM public.change_measurement_cycles c
            JOIN public.change_measurement_windows w ON w.cycle_id = c.id
            WHERE c.change_request_id = s.id
              AND w.available_after_pt > v_today_pt
          )
        )
      )
    ORDER BY COALESCE(s.applied_at, s.approved_at) DESC NULLS LAST
    LIMIT 1;
    IF FOUND AND NOT COALESCE(_acknowledge_in_flight, false) THEN
      v_sibling_words := CASE v_sibling.state
        WHEN 'approved' THEN 'approved and waiting to go live'
        ELSE 'live and still inside its measurement window'
      END;
      RAISE EXCEPTION 'Another change to this page is still in flight: "%" is %. Approving now means both changes are measured together, and neither outcome can be attributed on its own. Acknowledge that to approve anyway.',
        v_sibling.title, v_sibling_words;
    END IF;
  END IF;

  IF _action = 'verify' THEN
    IF v_row.applied_at IS NULL THEN
      RAISE EXCEPTION 'A change request cannot be verified before it is applied.';
    END IF;
    SELECT EXISTS (
      SELECT 1
      FROM public.search_console_snapshots s,
           LATERAL jsonb_array_elements(COALESCE(s.payload -> 'rows', '[]'::jsonb)) AS r
      WHERE s.tenant_id = v_row.tenant_id
        AND s.kind = 'page_query'
        AND s.period_start_pt > v_row.applied_at::date
        AND (r -> 'keys' ->> 0) = v_row.target_url
    ) INTO v_has_evidence;
    IF NOT v_has_evidence THEN
      RAISE EXCEPTION 'Waiting for finalized post-change Search Console data. No data is not evidence of success.';
    END IF;
  END IF;

  IF _action = 'roll_back' THEN
    SELECT e.commit_sha INTO v_revert_sha
    FROM public.change_request_executions e
    WHERE e.change_request_id = _id
      AND e.kind = 'source_revert'
      -- 'reconciled' is a revert commit the executor found in the branch rather
      -- than wrote; the commit exists either way, which is what this guards.
      AND e.status IN ('reverted', 'reconciled')
      AND e.commit_sha IS NOT NULL
    ORDER BY e.created_at DESC
    LIMIT 1;
    IF v_revert_sha IS NULL THEN
      RAISE EXCEPTION 'No revert commit is recorded for this change request. Run the revert first: rolling back is a commit, not a label.';
    END IF;
  END IF;

  UPDATE public.change_requests SET
    state = v_to,
    approved_by = CASE WHEN _action = 'approve' THEN v_uid ELSE approved_by END,
    approved_at = CASE WHEN _action = 'approve' THEN v_now ELSE approved_at END,
    rejected_by = CASE WHEN _action = 'reject' THEN v_uid ELSE rejected_by END,
    rejected_at = CASE WHEN _action = 'reject' THEN v_now ELSE rejected_at END,
    applied_by = CASE WHEN _action = 'mark_applied' THEN v_uid ELSE applied_by END,
    applied_at = CASE WHEN _action = 'mark_applied' THEN v_now ELSE applied_at END,
    applied_notes = CASE WHEN _action = 'mark_applied' THEN _notes ELSE applied_notes END,
    source_revision_after = CASE
      WHEN _action = 'mark_applied' AND _revision IS NOT NULL AND _revision <> '' THEN _revision
      WHEN _action = 'roll_back' THEN v_revert_sha
      ELSE source_revision_after END,
    verified_by = CASE WHEN _action = 'verify' THEN v_uid ELSE verified_by END,
    verified_at = CASE WHEN _action = 'verify' THEN v_now ELSE verified_at END,
    verification_notes = CASE WHEN _action = 'verify' THEN _notes ELSE verification_notes END,
    rolled_back_by = CASE WHEN _action = 'roll_back' THEN v_uid ELSE rolled_back_by END,
    rolled_back_at = CASE WHEN _action = 'roll_back' THEN v_now ELSE rolled_back_at END,
    rollback_notes = CASE WHEN _action = 'roll_back' THEN _notes ELSE rollback_notes END
  WHERE id = _id AND state = v_from
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.change_requests WHERE id = _id;
    RETURN jsonb_build_object('changed', false, 'change_request', to_jsonb(v_row));
  END IF;

  v_rec_state := CASE v_to
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'applied' THEN 'applied'
    WHEN 'verified' THEN 'verified'
    WHEN 'rolled_back' THEN 'rolled_back'
    ELSE NULL
  END;

  IF v_row.recommendation_id IS NOT NULL AND v_rec_state IS NOT NULL THEN
    UPDATE public.recommendations
      SET state = v_rec_state::recommendation_state,
          approved_by = CASE WHEN _action = 'approve' THEN v_uid ELSE approved_by END,
          approved_at = CASE WHEN _action = 'approve' THEN v_now ELSE approved_at END
      WHERE id = v_row.recommendation_id;
  END IF;

  IF _action IN ('approve','reject') AND v_row.inbox_item_id IS NOT NULL THEN
    UPDATE public.inbox_items
      SET lane = 'completed'::inbox_lane, resolved_at = v_now
      WHERE id = v_row.inbox_item_id AND resolved_at IS NULL;
  END IF;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    v_row.tenant_id,
    'user',
    v_uid::text,
    'change_request.' || v_to,
    'change_request',
    v_row.id,
    v_row.title || ': from ' || v_from || ' to ' || v_to || '.',
    jsonb_build_object(
      'changeRequestId', v_row.id,
      'fromState', v_from,
      'toState', v_to,
      'targetUrl', v_row.target_url,
      'actorId', v_uid,
      -- Present only on a deliberate double approval, so the audit trail can
      -- say the operator saw the earlier change and chose to proceed.
      'acknowledgedInFlightChangeId', CASE
        WHEN _action = 'approve' AND v_sibling.id IS NOT NULL AND COALESCE(_acknowledge_in_flight, false)
        THEN v_sibling.id ELSE NULL END
    )
  );

  RETURN jsonb_build_object('changed', true, 'change_request', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.transition_change_request(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_change_request(uuid, text, text, text, boolean) TO authenticated;
