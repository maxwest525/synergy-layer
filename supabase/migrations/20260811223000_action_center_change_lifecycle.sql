-- A change request is not finished when it is approved. Keep its Action Center
-- item open through source execution, publication proof, and outcome tracking.
CREATE OR REPLACE FUNCTION public.guard_open_change_request_action_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state text;
BEGIN
  IF NEW.subject_kind IS DISTINCT FROM 'change_request' OR NEW.subject_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT state INTO v_state
  FROM public.change_requests
  WHERE id = NEW.subject_id AND inbox_item_id = NEW.id;

  -- Clear must not hide an approved action before its execution/outcome loop is
  -- complete. The lifecycle trigger below closes terminal states.
  IF v_state IN ('approved', 'applied') AND NEW.lane = 'completed'::inbox_lane THEN
    NEW.lane := 'needs_attention'::inbox_lane;
    NEW.resolved_at := NULL;
    NEW.cleared_by := NULL;
    NEW.cleared_from_lane := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_open_change_request_action_item ON public.inbox_items;
CREATE TRIGGER guard_open_change_request_action_item
BEFORE UPDATE OF lane, resolved_at ON public.inbox_items
FOR EACH ROW
EXECUTE FUNCTION public.guard_open_change_request_action_item();

CREATE OR REPLACE FUNCTION public.sync_change_request_action_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_href text := '/changes/' || NEW.id::text;
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
    UPDATE public.inbox_items
    SET lane = 'needs_attention'::inbox_lane,
        resolved_at = NULL,
        cleared_by = NULL,
        cleared_from_lane = NULL,
        title = 'Track outcome: ' || NEW.title,
        summary = 'The approved change is proven live. Keep this action open until finalized outcome data is available.',
        actions = jsonb_build_array(jsonb_build_object(
          'kind', 'track', 'label', 'Track outcome', 'href', v_href
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
$$;

DROP TRIGGER IF EXISTS sync_change_request_action_item ON public.change_requests;
CREATE TRIGGER sync_change_request_action_item
AFTER INSERT OR UPDATE OF state, inbox_item_id, source_commit_sha, published_proof_at ON public.change_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_change_request_action_item();

REVOKE ALL ON FUNCTION public.guard_open_change_request_action_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_change_request_action_item() FROM PUBLIC, anon, authenticated;

-- Repair existing linked rows, including approvals that were previously hidden
-- in Completed as soon as the operator approved them.
UPDATE public.inbox_items AS i
SET lane = CASE
      WHEN c.state = 'proposed' THEN 'pending_approval'::inbox_lane
      WHEN c.state IN ('approved', 'applied') THEN 'needs_attention'::inbox_lane
      ELSE 'completed'::inbox_lane
    END,
    resolved_at = CASE
      WHEN c.state IN ('proposed', 'approved', 'applied') THEN NULL
      ELSE COALESCE(i.resolved_at, now())
    END,
    cleared_by = NULL,
    cleared_from_lane = NULL,
    title = CASE
      WHEN c.state = 'approved' AND c.source_commit_sha IS NULL THEN 'Execute approved change: ' || c.title
      WHEN c.state = 'approved' THEN 'Check publishing status: ' || c.title
      WHEN c.state = 'applied' THEN 'Track outcome: ' || c.title
      ELSE i.title
    END,
    summary = CASE
      WHEN c.state = 'approved' AND c.source_commit_sha IS NULL THEN 'Approved, but not executed or published. Review the exact before-and-after values, then execute when ready.'
      WHEN c.state = 'approved' THEN 'The approved source change is committed, but there is no live publication proof yet. Publish through the chosen release path, then verify the page.'
      WHEN c.state = 'applied' THEN 'The approved change is proven live. Keep this action open until finalized outcome data is available.'
      ELSE i.summary
    END,
    actions = jsonb_build_array(jsonb_build_object(
      'kind', CASE
        WHEN c.state = 'approved' AND c.source_commit_sha IS NULL THEN 'execute'
        WHEN c.state = 'approved' THEN 'review'
        WHEN c.state = 'applied' THEN 'track'
        ELSE 'review'
      END,
      'label', CASE
        WHEN c.state = 'approved' AND c.source_commit_sha IS NULL THEN 'Execute approved change'
        WHEN c.state = 'approved' THEN 'Check publishing status'
        WHEN c.state = 'applied' THEN 'Track outcome'
        WHEN c.state = 'proposed' THEN 'Review the proposed change'
        ELSE 'Review decision record'
      END,
      'href', '/changes/' || c.id::text
    ))
FROM public.change_requests AS c
WHERE c.inbox_item_id = i.id;
