-- Preserve every legacy row while removing non-actions from the Action Center.
-- This migration deletes nothing.

UPDATE public.recommendations
SET state = 'observed'::public.recommendation_state,
    requires_approval = false,
    metadata = metadata || jsonb_build_object('observationOnly', true)
WHERE metadata ->> 'observationOnly' = 'true';

UPDATE public.workflow_runs
SET state = 'cancelled'::public.run_state,
    finished_at = COALESCE(finished_at, now()),
    error = COALESCE(error, 'Cancelled during signal-integrity cutover: approval continuation is not implemented.')
WHERE state = 'awaiting_approval'::public.run_state;

UPDATE public.agents
SET status = 'paused'::public.entity_status,
    health = 'unknown'::public.health_state,
    current_task = NULL,
    metadata = metadata || jsonb_build_object('runtime_disabled', true)
WHERE status = 'active'::public.entity_status;

UPDATE public.workflows
SET status = 'paused'::public.entity_status,
    health = 'unknown'::public.health_state,
    metadata = metadata || jsonb_build_object('runtime_disabled', true)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(COALESCE(graph -> 'nodes', '[]'::jsonb)) AS node
  WHERE node ->> 'kind' IN ('agent', 'approval')
);

UPDATE public.schedules
SET enabled = (key = 'gsc-daily-observe'),
    health = CASE
      WHEN key = 'gsc-daily-observe' THEN health
      ELSE 'unknown'::public.health_state
    END,
    metadata = CASE
      WHEN key = 'gsc-daily-observe' THEN metadata
      ELSE metadata || jsonb_build_object('disabled_by', 'signal_integrity_cutover')
    END;

UPDATE public.inbox_items
SET lane = 'completed'::public.inbox_lane,
    resolved_at = COALESCE(resolved_at, now()),
    metadata = metadata || jsonb_build_object(
      'archived_by', 'signal_integrity_cutover',
      'archived_from_lane', lane::text
    )
WHERE resolved_at IS NULL
  AND subject_kind IS DISTINCT FROM 'change_request'
  AND (
    lane IS DISTINCT FROM 'needs_attention'::public.inbox_lane
    OR metadata ->> 'category' IS DISTINCT FROM 'failure'
  );

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
        WHERE tenant_id = _tenant_id
          AND resolved_at IS NULL
          AND (
            subject_kind = 'change_request'
            OR (lane = 'needs_attention' AND metadata ->> 'category' = 'failure')
          )),
      'pendingCompetitors', (SELECT count(*) FROM public.competitor_candidates
        WHERE tenant_id = _tenant_id AND review_state = 'pending'),
      'pendingAdvertisers', (SELECT count(*) FROM public.ad_advertiser_candidates
        WHERE tenant_id = _tenant_id AND review_state = 'pending'),
      'failedRuns', (SELECT count(*) FROM public.workflow_runs
        WHERE tenant_id = _tenant_id AND state = 'failed')
    ),
    'pendingApprovals', (SELECT count(*) FROM public.inbox_items
      WHERE tenant_id = _tenant_id
        AND lane = 'pending_approval'
        AND resolved_at IS NULL
        AND subject_kind = 'change_request')
  )
$function$;

REVOKE ALL ON FUNCTION public.command_center_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.command_center_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.command_center_overview(uuid) TO service_role;
