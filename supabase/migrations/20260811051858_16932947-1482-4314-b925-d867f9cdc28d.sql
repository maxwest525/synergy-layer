-- 1. Operator policy: SearchAtlas is excluded from AOOS entirely.
DELETE FROM public.tool_operations o
  USING public.tool_systems s
 WHERE o.system_id = s.id AND s.stable_key = 'sys.searchatlas_live';
DELETE FROM public.tool_aliases a
  USING public.tool_systems s
 WHERE a.system_id = s.id AND s.stable_key = 'sys.searchatlas_live';
DELETE FROM public.tool_systems WHERE stable_key = 'sys.searchatlas_live';

-- 2. Readiness facts kept independent of each other.
ALTER TABLE public.tool_systems
  ADD COLUMN IF NOT EXISTS is_essential boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS enabled_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS implemented_state text NOT NULL DEFAULT 'not_implemented',
  ADD COLUMN IF NOT EXISTS visible_in_aoos boolean NOT NULL DEFAULT true;

ALTER TABLE public.tool_systems
  DROP CONSTRAINT IF EXISTS tool_systems_available_state_check,
  DROP CONSTRAINT IF EXISTS tool_systems_enabled_state_check,
  DROP CONSTRAINT IF EXISTS tool_systems_implemented_state_check;

ALTER TABLE public.tool_systems
  ADD CONSTRAINT tool_systems_available_state_check
    CHECK (available_state IN ('unknown','available_to_enable','not_available')),
  ADD CONSTRAINT tool_systems_enabled_state_check
    CHECK (enabled_state IN ('unknown','not_enabled','enabled')),
  ADD CONSTRAINT tool_systems_implemented_state_check
    CHECK (implemented_state IN ('not_implemented','partially_implemented','implemented'));

-- 3. Plain product names for the foundational provider rows.
UPDATE public.tool_systems SET name = 'Google Ads API' WHERE stable_key = 'api.google_ads_v25';
UPDATE public.tool_systems SET name = 'Google Analytics Admin API' WHERE stable_key = 'api.ga_admin';
UPDATE public.tool_systems SET name = 'Google Search Console API' WHERE stable_key = 'api.search_console';
UPDATE public.tool_systems SET name = 'PageSpeed Insights' WHERE stable_key = 'api.pagespeed_insights';

-- 4. Canonical rows for providers with safe vault metadata but no row yet.
INSERT INTO public.tool_systems (
  tenant_id, stable_key, name, kind, provider, execution_location, discovered_from,
  installed_state, credential_state, verification_state, aoos_connection_state,
  available_state, enabled_state, implemented_state, is_essential,
  last_verified_at, source_reference, summary, metadata
)
SELECT t.id, v.stable_key, v.name, 'api', v.provider, 'remote', 'Vault metadata snapshot 2026-08-11',
       'not_installed', v.credential_state, v.verification_state, v.connection_state,
       v.available_state, v.enabled_state, v.implemented_state, v.is_essential,
       DATE '2026-08-11', v.source_reference, v.summary, v.metadata
  FROM public.tenants t
 CROSS JOIN (VALUES
   ('api.chrome_ux_report','Chrome UX Report','Google','unknown','surface_counted','queued','available_to_enable','unknown','not_implemented',true,
    'https://developer.chrome.com/docs/crux/api',
    'Real world field performance data for a site. Provider surface counted only. Full normalized import queued.',
    '{}'::jsonb),
   ('api.firecrawl','Firecrawl','Firecrawl','configured','live_proven','callable','available_to_enable','enabled','implemented',true,
    'https://docs.firecrawl.dev/',
    'Crawling and scraping provider. Safe credential metadata exists, AOOS research already calls it, and calls are live proven.',
    '{}'::jsonb),
   ('api.perplexity','Perplexity','Perplexity','configured','live_proven','callable','available_to_enable','enabled','implemented',false,
    'https://docs.perplexity.ai/',
    'Answer engine used by AOOS research. Safe credential metadata exists and calls are live proven.',
    '{}'::jsonb),
   ('api.openai','OpenAI','OpenAI','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'https://platform.openai.com/docs',
    'Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.anthropic','Anthropic','Anthropic','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'https://docs.anthropic.com/',
    'Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.gemini','Gemini','Google','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'https://ai.google.dev/gemini-api/docs',
    'Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.meta','Meta','Meta','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'https://developers.facebook.com/docs/marketing-apis/',
    'Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.slicktext','SlickText','SlickText','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'https://api.slicktext.com/docs/v1/',
    'Messaging provider. Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.resend','Resend','Resend','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'https://resend.com/docs',
    'Email delivery provider. Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.granot','Granot','Granot','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'Vendor documentation, not public',
    'Moving operations system. Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.hyperfx','HyperFX','HyperFX','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'Vendor documentation, not public',
    'Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.hermes','Hermes','Hermes','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'Vendor documentation, not public',
    'Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb),
   ('api.marky','Marky','Marky','configured','unverified','not_connected','available_to_enable','unknown','not_implemented',false,
    'Vendor documentation, not public',
    'Safe credential metadata exists. Nothing in AOOS calls it today.','{}'::jsonb)
 ) AS v(stable_key, name, provider, credential_state, verification_state, connection_state,
        available_state, enabled_state, implemented_state, is_essential,
        source_reference, summary, metadata)
ON CONFLICT (tenant_id, stable_key) DO NOTHING;

-- 5. Essentials. Foundational systems only, reusing canonical rows.
UPDATE public.tool_systems SET is_essential = false
 WHERE is_essential = true
   AND stable_key NOT IN ('sys.adloop','sys.openseo','api.dataforseo_v3','api.google_ads_v25',
     'api.ga4_data','api.ga_admin','api.search_console','api.pagespeed_insights',
     'api.chrome_ux_report','api.google_tag_manager','api.firecrawl');
UPDATE public.tool_systems SET is_essential = true
 WHERE stable_key IN ('sys.adloop','sys.openseo','api.dataforseo_v3','api.google_ads_v25',
   'api.ga4_data','api.ga_admin','api.search_console','api.pagespeed_insights',
   'api.chrome_ux_report','api.google_tag_manager','api.firecrawl');

-- 6. Readiness for the systems that already existed, stated independently.
UPDATE public.tool_systems
   SET available_state = 'available_to_enable',
       enabled_state = CASE WHEN stable_key IN ('api.dataforseo_v3','api.search_console')
                            THEN 'enabled' ELSE 'unknown' END,
       implemented_state = CASE WHEN stable_key IN ('api.dataforseo_v3','api.search_console')
                                THEN 'partially_implemented' ELSE 'not_implemented' END,
       aoos_connection_state = CASE WHEN stable_key IN ('api.dataforseo_v3','api.search_console')
                                    THEN 'callable' ELSE aoos_connection_state END
 WHERE kind = 'api';

-- Google OAuth configuration and a Google Ads developer token exist in safe vault
-- metadata. That proves configuration only, never that an API is enabled,
-- implemented, or callable from AOOS.
UPDATE public.tool_systems
   SET provider = 'Google',
       credential_state = 'configured',
       metadata = metadata || jsonb_build_object(
         'vault_evidence', jsonb_build_object(
           'proves', jsonb_build_array('OAuth configuration observed'),
           'does_not_prove', jsonb_build_array('API enabled','implemented in AOOS','callable from AOOS'),
           'checked_on', '2026-08-11'))
 WHERE stable_key IN ('api.google_ads_v25','api.ga4_data','api.ga_admin','api.search_console','api.google_tag_manager');

UPDATE public.tool_systems
   SET metadata = metadata || jsonb_build_object(
         'vault_evidence', jsonb_build_object(
           'proves', jsonb_build_array('OAuth configuration observed','Google Ads developer token observed'),
           'does_not_prove', jsonb_build_array('API enabled','account linked','implemented in AOOS','callable from AOOS'),
           'checked_on', '2026-08-11'))
 WHERE stable_key = 'api.google_ads_v25';

UPDATE public.tool_systems SET credential_state = 'configured'
 WHERE stable_key IN ('sys.github_mcp','sys.openrouter');

-- Local wrappers are never callable from AOOS just because they are installed.
UPDATE public.tool_systems
   SET available_state = 'available_to_enable',
       enabled_state = 'unknown',
       implemented_state = 'not_implemented',
       aoos_connection_state = 'not_connected'
 WHERE execution_location = 'local' AND kind <> 'vault';

-- 7. Keyword Planner is part of the Google Ads API, not a separate product.
INSERT INTO public.tool_aliases (tenant_id, system_id, alias_key, alias_label, registered_in, note)
SELECT s.tenant_id, s.id, 'alias.google_keyword_planner', 'Keyword Planner',
       'Google Ads API', 'Part of the Google Ads API, not a separate product.'
  FROM public.tool_systems s WHERE s.stable_key = 'api.google_ads_v25'
ON CONFLICT (tenant_id, alias_key) DO NOTHING;

-- 8. The credential vault, described only in aggregate.
UPDATE public.tool_systems
   SET name = 'Credential vault (metadata only)',
       kind = 'vault',
       execution_location = 'remote',
       installed_state = 'not_installed',
       credential_state = 'configured',
       verification_state = 'unverified',
       aoos_connection_state = 'not_connected',
       available_state = 'not_available',
       enabled_state = 'unknown',
       implemented_state = 'not_implemented',
       is_essential = false,
       provider = NULL,
       version = NULL,
       discovered_from = 'Vault metadata snapshot 2026-08-11',
       source_reference = 'Safe metadata enumeration only',
       last_verified_at = DATE '2026-08-11',
       summary = '25 metadata records checked · 20 active records mapped to 16 providers · secret values never copied.',
       metadata = jsonb_build_object(
         'records_checked', 25,
         'active_records_mapped', 20,
         'providers_mapped', 16,
         'secret_values_copied', false,
         'note', 'Aggregate only. No credential names, labels, accounts, hosts, paths, or values are stored.')
 WHERE stable_key = 'sys.marketing_yolo_vault';