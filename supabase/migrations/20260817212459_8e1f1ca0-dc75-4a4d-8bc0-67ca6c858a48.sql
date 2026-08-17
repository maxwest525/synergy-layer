CREATE OR REPLACE FUNCTION public.sync_change_request_action_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $sync_action$
DECLARE
  v_now timestamptz := now();
  v_href text := '/changes/' || NEW.id::text;
  v_next timestamptz;
BEGIN
  IF NEW.inbox_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.state = 'proposed' THEN
    UPDATE public.inbox_items
    SET lane = 'pending_approval'::inbox_lane,
        resolved_at = NULL,
        cleared_by = NULL,
        cleared_from_lane = NULL,
        actions = jsonb_build_array(jsonb_build_object(
          'kind', 'review', 'label', 'Review the proposed change', 'href', v_href
        ))
    WHERE id = NEW.inbox_item_id;
  ELSIF NEW.state = 'approved' THEN
    UPDATE public.inbox_items
    SET lane = 'needs_attention'::inbox_lane,
        resolved_at = NULL,
        cleared_by = NULL,
        cleared_from_lane = NULL,
        title = CASE
          WHEN NEW.source_commit_sha IS NULL THEN 'Execute approved change: ' || NEW.title
          ELSE 'Check publishing status: ' || NEW.title
        END,
        summary = CASE
          WHEN NEW.source_commit_sha IS NULL THEN 'Approved, but not executed or published. Review the exact before-and-after values, then execute when ready.'
          ELSE 'The approved source change is committed, but there is no live publication proof yet. Publish through the chosen release path, then verify the page.'
        END,
        actions = jsonb_build_array(jsonb_build_object(
          'kind', CASE WHEN NEW.source_commit_sha IS NULL THEN 'execute' ELSE 'review' END,
          'label', CASE WHEN NEW.source_commit_sha IS NULL THEN 'Execute approved change' ELSE 'Check publishing status' END,
          'href', v_href
        ))
    WHERE id = NEW.inbox_item_id;
  ELSIF NEW.state = 'applied' THEN
    -- The change is live and inside its measurement cycle. Nothing can be
    -- decided until the window closes, so it is observable, not an action.
    SELECT min(w.available_after_pt)
      INTO v_next
      FROM public.change_measurement_windows AS w
      JOIN public.change_measurement_cycles AS c ON c.id = w.cycle_id
     WHERE c.change_request_id = NEW.id
       AND w.available_after_pt > v_now;

    UPDATE public.inbox_items
    SET lane = 'fyi'::inbox_lane,
        resolved_at = NULL,
        cleared_by = NULL,
        cleared_from_lane = NULL,
        title = 'Measuring outcome: ' || NEW.title,
        summary = CASE
          WHEN v_next IS NULL THEN 'The approved change is proven live and sits in its measurement cycle. Nothing is required from you here; the outcome appears once finalized data is stored.'
          ELSE 'The approved change is proven live and sits in its measurement cycle. Nothing is required from you until finalized data is available after ' || to_char(v_next, 'YYYY-MM-DD') || '.'
        END,
        actions = jsonb_build_array(jsonb_build_object(
          'kind', 'review', 'label', 'Watch the measurement', 'href', v_href
        ))
    WHERE id = NEW.inbox_item_id;
  ELSIF NEW.state IN ('rejected', 'verified', 'rolled_back') THEN
    UPDATE public.inbox_items
    SET lane = 'completed'::inbox_lane,
        resolved_at = COALESCE(resolved_at, v_now),
        cleared_by = NULL,
        cleared_from_lane = NULL,
        actions = jsonb_build_array(jsonb_build_object(
          'kind', 'review', 'label', 'Review decision record', 'href', v_href
        ))
    WHERE id = NEW.inbox_item_id;
  END IF;

  RETURN NEW;
END;
$sync_action$;

REVOKE ALL ON FUNCTION public.sync_change_request_action_item() FROM PUBLIC, anon, authenticated;

-- Move already-applied changes out of the action lane into the observable lane.
UPDATE public.inbox_items AS i
SET lane = 'fyi'::inbox_lane,
    resolved_at = NULL,
    cleared_by = NULL,
    cleared_from_lane = NULL,
    title = 'Measuring outcome: ' || c.title,
    summary = 'The approved change is proven live and sits in its measurement cycle. Nothing is required from you here; the outcome appears once finalized data is stored.',
    actions = jsonb_build_array(jsonb_build_object(
      'kind', 'review', 'label', 'Watch the measurement', 'href', '/changes/' || c.id::text
    ))
FROM public.change_requests AS c
WHERE c.inbox_item_id = i.id
  AND c.state = 'applied'
  AND i.lane <> 'fyi'::inbox_lane;