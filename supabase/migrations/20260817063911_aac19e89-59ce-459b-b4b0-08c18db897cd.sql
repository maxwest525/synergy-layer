CREATE OR REPLACE FUNCTION public.provider_spend_summary(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'Not a member of this workspace.';
  END IF;

  SELECT jsonb_build_object(
    'dataforseo', (
      SELECT jsonb_build_object(
        'requests', COUNT(*),
        'failures', COUNT(*) FILTER (WHERE outcome IS DISTINCT FROM 'success'),
        'costUsd', COALESCE(SUM(cost_usd), 0),
        'lastRequestAt', MAX(created_at)
      ) FROM public.dataforseo_requests WHERE tenant_id = _tenant_id
    ),
    'serpapi', (
      SELECT jsonb_build_object(
        'requests', COUNT(*),
        'failures', COUNT(*) FILTER (WHERE state IS DISTINCT FROM 'succeeded'),
        'credits', COALESCE(SUM(charged_credits), 0),
        'lastRequestAt', MAX(created_at)
      ) FROM public.serpapi_requests WHERE tenant_id = _tenant_id
    ),
    'budget', (
      SELECT jsonb_build_object(
        'periodMonth', period_month,
        'ceilingUsd', ceiling_usd,
        'spentUsd', spent_usd,
        'hardStop', hard_stop
      ) FROM public.dataforseo_budgets WHERE tenant_id = _tenant_id
      ORDER BY period_month DESC LIMIT 1
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.provider_spend_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provider_spend_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.provider_spend_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_spend_summary(uuid) TO service_role;