-- The source-controlled GA4 bridge is callable, but credential presence and a
-- successful provider read remain runtime facts shown by /measurement.
UPDATE public.tool_systems
SET
  enabled_state = 'enabled',
  implemented_state = 'implemented',
  aoos_connection_state = 'callable',
  summary = 'AOOS implements an operator-triggered direct GA4 Data API runReport bridge for properties/536830122. It stores exact hostname, page-path-plus-query, and event-name inventory in immutable GA4 snapshots and records every attempt. Credential presence alone is not connection proof; /measurement shows Connected only after a successful snapshot.',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'bridge', 'manual operator refresh from /measurement',
    'endpoint', 'analyticsdata.googleapis.com/v1beta/properties/536830122:runReport',
    'credential_modes', jsonb_build_array('service_account', 'oauth_refresh_token'),
    'dimensions', jsonb_build_array('hostName', 'pagePathPlusQueryString', 'eventName'),
    'scheduling', 'disabled'
  ),
  updated_at = now()
WHERE stable_key = 'api.ga4_data';