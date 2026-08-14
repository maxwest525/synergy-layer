-- The source-controlled GA4 bridge is callable only after the tenant's
-- selected Search Console property resolves through the approved GA4 registry.
-- Credential presence and a successful provider read remain runtime facts.
UPDATE public.tool_systems
SET
  enabled_state = 'enabled',
  implemented_state = 'implemented',
  aoos_connection_state = 'callable',
  summary = 'AOOS implements tenant-scoped GA4 Data API runReport reads. The selected Search Console property must resolve through the approved GA4 registry before any provider call. It stores exact hostname, page-path-plus-query, and event-name inventory in immutable GA4 snapshots and records every attempt. Credential presence alone is not connection proof; /measurement shows Connected only after a successful snapshot.',
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'bridge', 'tenant-bound manual refresh and governed change-window measurement',
    'property_binding', 'selected Search Console property -> approved GA4 registry',
    'approved_bindings', jsonb_build_object(
      'sc-domain:trumoveinc.com', 'properties/536830122'
    ),
    'endpoint_template', 'analyticsdata.googleapis.com/v1beta/{bound_property}:runReport',
    'credential_modes', jsonb_build_array('service_account', 'oauth_refresh_token'),
    'dimensions', jsonb_build_array('hostName', 'pagePathPlusQueryString', 'eventName'),
    'scheduling', 'protected daily reconciliation for due change windows'
  ),
  updated_at = now()
WHERE stable_key = 'api.ga4_data';
