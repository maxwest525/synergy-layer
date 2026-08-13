-- The lifecycle trigger keeps approved/applied change requests open, but a
-- direct clear RPC used to return success and write a false audit entry after
-- that trigger restored the item. Reject that request before any update occurs.
CREATE OR REPLACE FUNCTION public.clear_inbox_item(_item_id uuid)
RETURNS public.inbox_items
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.inbox_items%ROWTYPE;
  v_prior public.inbox_lane;
  v_change_state text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in as an operator to clear inbox items.';
  END IF;
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Operator or admin role required to clear inbox items.';
  END IF;

  SELECT * INTO v_item FROM public.inbox_items WHERE id = _item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That inbox item is not visible to this account.';
  END IF;
  IF NOT public.is_tenant_member(v_item.tenant_id) THEN
    RAISE EXCEPTION 'That inbox item belongs to another client workspace.';
  END IF;
  IF v_item.resolved_at IS NOT NULL OR v_item.lane = 'completed' THEN
    RAISE EXCEPTION 'That inbox item is already resolved.';
  END IF;
  IF v_item.lane = 'pending_approval' THEN
    RAISE EXCEPTION 'Items waiting on approval must be decided on their review surface, not cleared.';
  END IF;

  IF v_item.subject_kind = 'change_request' AND v_item.subject_id IS NOT NULL THEN
    SELECT state INTO v_change_state
    FROM public.change_requests
    WHERE id = v_item.subject_id
      AND inbox_item_id = v_item.id
      AND tenant_id = v_item.tenant_id;

    IF v_change_state IN ('approved', 'applied') THEN
      RAISE EXCEPTION 'Approved or applied change requests must stay open until they are verified or rolled back.';
    END IF;
  END IF;

  v_prior := v_item.lane;

  UPDATE public.inbox_items
     SET lane = 'completed',
         resolved_at = now(),
         cleared_from_lane = v_prior,
         cleared_by = v_uid
   WHERE id = _item_id AND resolved_at IS NULL
  RETURNING * INTO v_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That inbox item changed while you were clearing it. Refresh and try again.';
  END IF;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    v_item.tenant_id, 'user', v_uid::text, 'inbox.cleared', 'inbox_item', _item_id,
    format('Inbox item "%s" was cleared.', v_item.title),
    jsonb_build_object('cleared_from_lane', v_prior)
  );

  RETURN v_item;
END
$function$;
