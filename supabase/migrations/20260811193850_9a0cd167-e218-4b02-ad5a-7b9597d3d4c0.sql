DO $mig$
DECLARE
  def text;
  before text;
  old_sys text := $r1$  (target_tenant, 'api.pagespeed_insights', 'PageSpeed Insights', 'api', 'Google', 'v5', 'remote', 'Official documentation 2026-08-11', 'not_installed', 'unknown', 'surface_counted', 'not_connected', '2026-08-11', 'https://developers.google.com/speed/docs/insights/v5/get-started', 'Provider surface counted. Full normalized import queued.', '{}'::jsonb, true, 'available_to_enable', 'unknown', 'not_implemented', true),$r1$;
  new_sys text := $r2$  (target_tenant, 'api.pagespeed_insights', 'PageSpeed Insights', 'api', 'Google', 'v5', 'remote', 'Official documentation 2026-08-11', 'not_installed', 'none', 'partially_live_proven', 'callable', '2026-08-11', 'https://developers.google.com/speed/docs/insights/v5/get-started', 'AOOS implements a manual operator bridge to the official v5 runPagespeed endpoint. The bridge has been exercised: the last calls reached Google and failed with HTTP 429 because the anonymous quota is exhausted, so no successful measurement is stored. A PAGESPEED_API_KEY is optional for the endpoint but currently required here to clear that quota.', '{"bridge": "manual operator run from /measurement", "credentials": "optional for the endpoint, currently needed to clear the exhausted anonymous quota", "last_call_outcome": "HTTP 429 anonymous quota exhausted"}'::jsonb, true, 'available_to_enable', 'enabled', 'implemented', true),$r2$;
  old_ops text := $r3$    ('sys.openseo', 'whoami', 'whoami', 'read', false, 'free', NULL, 'whoami', NULL, NULL, '{}'::jsonb)$r3$;
  new_ops text := $r4$    ('sys.openseo', 'whoami', 'whoami', 'read', false, 'free', NULL, 'whoami', NULL, NULL, '{}'::jsonb),
    ('api.pagespeed_insights', 'runpagespeed', 'runPagespeed (PageSpeed Insights v5)', 'read', false, 'provider_quota', 'GET', NULL, 'Official v5 runPagespeed endpoint, called once per operator click from the AOOS Measurement screen. Reads only. Credentials are optional for the endpoint but currently needed here because the anonymous quota is exhausted.', 'https://developers.google.com/speed/docs/insights/v5/get-started', '{}'::jsonb)$r4$;
  anchor text := $r5$  ON CONFLICT (tenant_id, alias_key) DO UPDATE SET alias_kind = EXCLUDED.alias_kind;$r5$;
  reconcile text := $r6$
  UPDATE public.tool_systems SET
      credential_state = 'none',
      verification_state = 'partially_live_proven',
      aoos_connection_state = 'callable',
      enabled_state = 'enabled',
      implemented_state = 'implemented',
      summary = 'AOOS implements a manual operator bridge to the official v5 runPagespeed endpoint. The bridge has been exercised: the last calls reached Google and failed with HTTP 429 because the anonymous quota is exhausted, so no successful measurement is stored. A PAGESPEED_API_KEY is optional for the endpoint but currently required here to clear that quota.',
      metadata = '{"bridge": "manual operator run from /measurement", "credentials": "optional for the endpoint, currently needed to clear the exhausted anonymous quota", "last_call_outcome": "HTTP 429 anonymous quota exhausted"}'::jsonb
   WHERE tenant_id = target_tenant AND stable_key = 'api.pagespeed_insights';$r6$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p
   WHERE p.proname = 'seed_tool_estate_for_tenant'
     AND p.pronamespace = 'public'::regnamespace;
  IF def IS NULL THEN
    RAISE EXCEPTION 'seed_tool_estate_for_tenant is missing; refusing to guess the catalog';
  END IF;

  IF position(new_sys in def) = 0 THEN
    before := def;
    def := replace(def, old_sys, new_sys);
    IF def = before THEN
      RAISE EXCEPTION 'PageSpeed catalog row did not match the expected source-controlled text';
    END IF;
  END IF;

  IF position('api.pagespeed_insights'', ''runpagespeed' in def) = 0 THEN
    before := def;
    def := replace(def, old_ops, new_ops);
    IF def = before THEN
      RAISE EXCEPTION 'PageSpeed operation anchor did not match the expected source-controlled text';
    END IF;
  END IF;

  IF position(reconcile in def) = 0 THEN
    before := def;
    def := replace(def, anchor, anchor || reconcile);
    IF def = before THEN
      RAISE EXCEPTION 'Reconciliation anchor did not match the expected source-controlled text';
    END IF;
  END IF;

  EXECUTE def;
END $mig$;

REVOKE ALL ON FUNCTION public.seed_tool_estate_for_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_tool_estate_for_tenant(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_tool_estate_for_tenant(uuid) TO service_role;

DO $run$
DECLARE t uuid;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.seed_tool_estate_for_tenant(t);
  END LOOP;
END $run$;