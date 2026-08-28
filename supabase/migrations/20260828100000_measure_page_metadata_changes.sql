-- Measure meta-description changes the same way title/H1 changes are measured.
--
-- The measurement lifecycle triggers gated on `proposal_type = 'title_h1'`, so
-- a page_metadata change — the lane every description defect and weak-CTR
-- finding drafts into — could be approved, committed, and proven live, and
-- then never received a measurement cycle, windows, or a verdict. The gate was
-- an artifact of title/H1 being the first lane built, not a measurement
-- decision anyone made.
--
-- Grounding for extending, rather than inventing a new design:
--   * Google's own documentation places titles and meta descriptions in the
--     same category: they affect how the result APPEARS, not how it ranks
--     ("Meta descriptions and titles affect appearance, not ranking" — see
--     .claude/skills/seo-measurement/SKILL.md, citing
--     developers.google.com/search/docs/appearance/title-link and the snippet
--     documentation). The observable for both lanes is therefore identical:
--     clicks, impressions, CTR and position on the page's own Search Console
--     rows, page-dimension, exactly what the existing windows read.
--   * Because the observable is identical, the grounded windows (14 / 28 / 56 /
--     90, derived in the operator research cited by
--     20260820200000_grounded_measurement_windows.sql) carry over unchanged.
--     No new number is introduced by this migration.
--
-- Deliberately NOT extended: `site.crawl_directives`. A robots.txt change's
-- outcome is crawl and indexation state — answered by URL Inspection coverage
-- and sitemap indexing counts, not by page CTR windows. Opening a CTR-shaped
-- measurement cycle for it would grade the wrong observable, so that lane
-- stays unmeasured here and says so instead of shipping a number.
--
-- Order matters inside this migration: the backfill runs BEFORE the functions
-- are replaced, because the old triggers ignore page_metadata rows entirely —
-- so the backfill's UPDATE of change_requests.live_at passes through the old
-- capture guard untouched, and the cycles and windows are inserted directly
-- (with live_at set at INSERT, so the cycles UPDATE guard never fires).

-- 1. Backfill the live anchor for page_metadata changes already proven live.
--    The old capture trigger returns early for page_metadata, so this UPDATE
--    is not intercepted; after the functions below are replaced, live_at can
--    once again only be set by a rendered published proof.
UPDATE public.change_requests
SET live_at = published_proof_at
WHERE proposal_type = 'page_metadata'
  AND published_proof_at IS NOT NULL
  AND live_at IS NULL;

-- 2. Backfill cycles for every page_metadata change already approved, with the
--    live anchor included at insert where one exists.
INSERT INTO public.change_measurement_cycles(
  tenant_id, change_request_id, target_url, gsc_property, approved_at, live_at, approval_snapshot
)
SELECT
  cr.tenant_id,
  cr.id,
  cr.target_url,
  (SELECT p.site_url FROM public.search_console_properties p
     WHERE p.tenant_id = cr.tenant_id AND p.selected = true LIMIT 1),
  cr.approved_at,
  cr.live_at,
  jsonb_build_object(
    'changes', cr.changes,
    'evidence', cr.evidence,
    'generationContext', cr.generation_context,
    'verificationBaseline', cr.verification_baseline,
    'sourceRevision', cr.source_revision_before
  )
FROM public.change_requests cr
WHERE cr.proposal_type = 'page_metadata'
  AND cr.approved_at IS NOT NULL
ON CONFLICT (change_request_id) DO NOTHING;

-- 3. Backfill the baseline window for those cycles, dated from approval.
INSERT INTO public.change_measurement_windows(
  tenant_id, cycle_id, window_days, anchor_kind, period_start_pt, period_end_pt, available_after_pt
)
SELECT
  cycle.tenant_id,
  cycle.id,
  0,
  'approval_baseline',
  ((cycle.approved_at AT TIME ZONE 'America/Los_Angeles')::date) - 28,
  ((cycle.approved_at AT TIME ZONE 'America/Los_Angeles')::date) - 1,
  ((cycle.approved_at AT TIME ZONE 'America/Los_Angeles')::date)
FROM public.change_measurement_cycles AS cycle
JOIN public.change_requests cr ON cr.id = cycle.change_request_id
WHERE cr.proposal_type = 'page_metadata'
ON CONFLICT (cycle_id, window_days) DO NOTHING;

-- 4. Backfill the grounded post-live windows where the change is already live.
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
JOIN public.change_requests cr ON cr.id = cycle.change_request_id
CROSS JOIN (VALUES (14), (28), (56), (90)) AS span(window_days)
WHERE cr.proposal_type = 'page_metadata'
  AND cycle.live_at IS NOT NULL
ON CONFLICT (cycle_id, window_days) DO NOTHING;

-- 5. The capture trigger: identical to 20260814103007's definition except the
--    gate now admits both wording lanes.
CREATE OR REPLACE FUNCTION public.capture_change_measurement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
  v_property text;
  v_approved_date date;
  v_live_date date;
BEGIN
  IF NEW.proposal_type NOT IN ('title_h1', 'page_metadata') THEN RETURN NEW; END IF;
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

-- 6. The materialize trigger: identical to 20260820200000's definition (the
--    grounded windows, no 7-day) except the gate now admits both wording lanes.
CREATE OR REPLACE FUNCTION public.materialize_change_measurement_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle_id uuid;
  v_property text;
  v_approved_date date;
  v_live_date date;
BEGIN
  IF NEW.proposal_type NOT IN ('title_h1', 'page_metadata') THEN RETURN NEW; END IF;
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
