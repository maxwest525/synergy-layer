-- Measure fixes on the windows the research grounds, not the ones nobody derived.
--
-- `change_measurement_windows.window_days` was constrained to (0, 7, 14, 28).
-- Those numbers trace back to one line in an old spec listing "comparison
-- windows (7 / 14 / 28 / 56 days)" with no derivation anywhere behind it. 56
-- was dropped along the way and a 0 baseline added.
--
-- The operator's own research replaces them, under a heading that names the
-- problem it solves ("Prediction-engine thresholds, evidence-based, replacing
-- vibes"): 14, 28, 56 and 90. `src/lib/outcome-verdict.ts` already grades on
-- exactly those, and until now two of the four could not physically be stored,
-- so the grader could never see them.
--
-- Three changes, in order of how reversible they are:
--
--  1. Widen the constraint. Additive, and it keeps 0 and 7 so every row already
--     stored stays valid.
--  2. Stop creating new 7 day windows. 14 already asks the only question 7
--     could answer ("has Google indexed it at all"), and nothing derives 7 as a
--     measurement window. Existing 7 day rows are kept and shown, labelled as
--     ungraded rather than deleted: hiding them would hide the problem.
--  3. Backfill 56 and 90 for changes already live, so a fix published three
--     months ago is gradeable now rather than only from the next one onwards.

ALTER TABLE public.change_measurement_windows
  DROP CONSTRAINT IF EXISTS change_measurement_windows_window_days_check;

ALTER TABLE public.change_measurement_windows
  ADD CONSTRAINT change_measurement_windows_window_days_check
  CHECK (window_days IN (0, 7, 14, 28, 56, 90));

CREATE OR REPLACE FUNCTION public.materialize_change_measurement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
  v_property text;
  v_approved_date date;
  v_live_date date;
BEGIN
  IF NEW.proposal_type <> 'title_h1' THEN RETURN NEW; END IF;
  IF NEW.approved_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.approved_at IS NULL) THEN
    SELECT site_url INTO v_property FROM public.search_console_properties WHERE tenant_id = NEW.tenant_id AND selected = true LIMIT 1;
    INSERT INTO public.change_measurement_cycles(tenant_id, change_request_id, target_url, gsc_property, approved_at, approval_snapshot)
    VALUES (NEW.tenant_id, NEW.id, NEW.target_url, v_property, NEW.approved_at,
      jsonb_build_object('changes', NEW.changes, 'evidence', NEW.evidence, 'generationContext', NEW.generation_context,
        'verificationBaseline', NEW.verification_baseline, 'sourceRevision', NEW.source_revision_before))
    ON CONFLICT (change_request_id) DO NOTHING RETURNING id INTO v_cycle_id;
    IF v_cycle_id IS NULL THEN SELECT id INTO v_cycle_id FROM public.change_measurement_cycles WHERE change_request_id = NEW.id; END IF;
    v_approved_date := (NEW.approved_at AT TIME ZONE 'America/Los_Angeles')::date;
    -- The before picture, unchanged: the 28 days ending the day before approval.
    INSERT INTO public.change_measurement_windows(tenant_id, cycle_id, window_days, anchor_kind, period_start_pt, period_end_pt, available_after_pt)
    VALUES (NEW.tenant_id, v_cycle_id, 0, 'approval_baseline', v_approved_date - 28, v_approved_date - 1, v_approved_date)
    ON CONFLICT (cycle_id, window_days) DO NOTHING;
  END IF;
  IF NEW.live_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.live_at IS NULL) THEN
    SELECT id INTO v_cycle_id FROM public.change_measurement_cycles WHERE change_request_id = NEW.id;
    IF v_cycle_id IS NULL THEN RAISE EXCEPTION 'A rendered live anchor requires an immutable approval baseline.'; END IF;
    UPDATE public.change_measurement_cycles SET live_at = NEW.live_at WHERE id = v_cycle_id AND live_at IS NULL;
    v_live_date := (NEW.live_at AT TIME ZONE 'America/Los_Angeles')::date;
    -- 14 asks whether Google indexed it, 28 whether it earned clicks, 56 and 90
    -- whether it held. No 7: nothing derives it, and 14 already answers the only
    -- question it could.
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

-- Backfill. Every cycle already live gets its two longer windows, dated from
-- the same `live_at` the existing windows were cut from, so a fix published
-- months ago becomes gradeable now instead of from the next change onwards.
-- `ON CONFLICT DO NOTHING` makes this safe to run more than once, and no
-- existing row is touched.
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
