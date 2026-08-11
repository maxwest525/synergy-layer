CREATE OR REPLACE FUNCTION public.command_center_overview(_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
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
        'key', c.key, 'name', c.name,
        'integration_state', c.integration_state, 'health', c.health))
      FROM public.capabilities c), '[]'::jsonb),
    'runs', coalesce((
      SELECT jsonb_agg(r) FROM (
        SELECT wr.id, wr.state, wr.trigger_source, wr.created_at, wr.duration_ms, wr.error,
               CASE WHEN w.id IS NULL THEN NULL
                    ELSE jsonb_build_object('key', w.key, 'name', w.name) END AS workflows
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
    'pendingApprovals', (SELECT count(*) FROM public.inbox_items
      WHERE tenant_id = _tenant_id AND lane = 'pending_approval')
  )
$$;

GRANT EXECUTE ON FUNCTION public.command_center_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.command_center_overview(uuid) TO service_role;