ALTER TABLE public.inbox_items
  ADD COLUMN IF NOT EXISTS cleared_from_lane public.inbox_lane,
  ADD COLUMN IF NOT EXISTS cleared_by uuid;

ALTER TYPE public.recommendation_state ADD VALUE IF NOT EXISTS 'observed';

CREATE OR REPLACE FUNCTION public.clear_inbox_item(_item_id uuid)
RETURNS public.inbox_items
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.inbox_items%ROWTYPE;
  v_prior public.inbox_lane;
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

CREATE OR REPLACE FUNCTION public.reopen_inbox_item(_item_id uuid)
RETURNS public.inbox_items
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.inbox_items%ROWTYPE;
  v_prior public.inbox_lane;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in as an operator to reopen inbox items.';
  END IF;
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Operator or admin role required to reopen inbox items.';
  END IF;

  SELECT * INTO v_item FROM public.inbox_items WHERE id = _item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That inbox item is not visible to this account.';
  END IF;
  IF NOT public.is_tenant_member(v_item.tenant_id) THEN
    RAISE EXCEPTION 'That inbox item belongs to another client workspace.';
  END IF;
  IF v_item.lane <> 'completed' OR v_item.cleared_from_lane IS NULL THEN
    RAISE EXCEPTION 'Only a manually cleared item can be reopened. Approved, rejected, and system completed items stay closed.';
  END IF;

  v_prior := v_item.cleared_from_lane;

  UPDATE public.inbox_items
     SET lane = v_prior,
         resolved_at = NULL,
         cleared_from_lane = NULL,
         cleared_by = NULL
   WHERE id = _item_id AND cleared_from_lane IS NOT NULL
  RETURNING * INTO v_item;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That inbox item changed while you were reopening it. Refresh and try again.';
  END IF;

  INSERT INTO public.activity_events (
    tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload
  ) VALUES (
    v_item.tenant_id, 'user', v_uid::text, 'inbox.reopened', 'inbox_item', _item_id,
    format('Inbox item "%s" was reopened.', v_item.title),
    jsonb_build_object('restored_lane', v_prior)
  );

  RETURN v_item;
END
$function$;

REVOKE ALL ON FUNCTION public.clear_inbox_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_inbox_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_inbox_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_inbox_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_inbox_item(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reopen_inbox_item(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.command_center_overview(_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'counts', jsonb_build_object(
      'assets', (SELECT count(*) FROM public.assets WHERE tenant_id = _tenant_id),
      'capabilities', (SELECT count(*) FROM public.capabilities),
      'knowledge_entries', (SELECT count(*) FROM public.knowledge_entries WHERE tenant_id = _tenant_id),
      'agents', (SELECT count(*) FROM public.agents),
      'workflows', (SELECT count(*) FROM public.workflows),
      'recommendations', (SELECT count(*) FROM public.recommendations WHERE tenant_id = _tenant_id),
      'schedules', (SELECT count(*) FROM public.schedules),
      'inbox_items', (SELECT count(*) FROM public.inbox_items WHERE tenant_id = _tenant_id)
    ),
    'capabilities', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'key', c.key, 'name', c.name,
        'integration_state', c.integration_state, 'health', c.health))
      FROM public.capabilities c), '[]'::jsonb),
    'runs', coalesce((
      SELECT jsonb_agg(r) FROM (
        SELECT wr.id, wr.state, wr.trigger_source, wr.created_at, wr.duration_ms, wr.error,
               wr.workflow_id, wr.context,
               CASE WHEN w.id IS NULL THEN NULL
                    ELSE jsonb_build_object('id', w.id, 'key', w.key, 'name', w.name) END AS workflows
        FROM public.workflow_runs wr
        LEFT JOIN public.workflows w ON w.id = wr.workflow_id
        WHERE wr.tenant_id = _tenant_id
        ORDER BY wr.created_at DESC
        LIMIT 50
      ) r), '[]'::jsonb),
    'activity', coalesce((
      SELECT jsonb_agg(a) FROM (
        SELECT * FROM public.activity_events
        WHERE tenant_id = _tenant_id
        ORDER BY occurred_at DESC
        LIMIT 20
      ) a), '[]'::jsonb),
    'evidence', jsonb_build_object(
      'spentUsd', coalesce((SELECT b.spent_usd FROM public.dataforseo_budgets b
        WHERE b.tenant_id = _tenant_id
          AND b.period_month = date_trunc('month', now())::date), 0),
      'ceilingUsd', coalesce((SELECT b.ceiling_usd FROM public.dataforseo_budgets b
        WHERE b.tenant_id = _tenant_id
          AND b.period_month = date_trunc('month', now())::date), 0),
      'providerRequests', (SELECT count(*) FROM public.dataforseo_requests WHERE tenant_id = _tenant_id),
      'dataforseoSnapshots', (SELECT count(*) FROM public.dataforseo_snapshots WHERE tenant_id = _tenant_id),
      'searchConsoleSnapshots', (SELECT count(*) FROM public.search_console_snapshots WHERE tenant_id = _tenant_id),
      'lastDataforseoAt', (SELECT max(collected_at) FROM public.dataforseo_snapshots WHERE tenant_id = _tenant_id),
      'lastSearchConsoleAt', (SELECT max(collected_at) FROM public.search_console_snapshots WHERE tenant_id = _tenant_id),
      'pendingKeywordCandidates', (SELECT count(*) FROM public.keyword_candidates
        WHERE tenant_id = _tenant_id AND review_state = 'pending'),
      'trackedKeywords', (SELECT count(*) FROM public.tracked_keywords
        WHERE tenant_id = _tenant_id AND active = true),
      'competitorCandidates', (SELECT count(*) FROM public.competitor_candidates WHERE tenant_id = _tenant_id),
      'trackedCompetitors', (SELECT count(*) FROM public.tracked_competitors
        WHERE tenant_id = _tenant_id AND active = true)
    ),
    'quickActions', jsonb_build_object(
      'openInbox', (SELECT count(*) FROM public.inbox_items
        WHERE tenant_id = _tenant_id AND resolved_at IS NULL AND lane <> 'completed'),
      'pendingCompetitors', (SELECT count(*) FROM public.competitor_candidates
        WHERE tenant_id = _tenant_id AND review_state = 'pending'),
      'pendingAdvertisers', (SELECT count(*) FROM public.ad_advertiser_candidates
        WHERE tenant_id = _tenant_id AND review_state = 'pending'),
      'failedRuns', (SELECT count(*) FROM public.workflow_runs
        WHERE tenant_id = _tenant_id AND state = 'failed')
    ),
    'pendingApprovals', (SELECT count(*) FROM public.inbox_items
      WHERE tenant_id = _tenant_id AND lane = 'pending_approval' AND resolved_at IS NULL)
  )
$function$;

REVOKE ALL ON FUNCTION public.command_center_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.command_center_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.command_center_overview(uuid) TO service_role;