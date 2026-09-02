-- The bridge secret a caller must present is the one its own connection
-- names.
--
-- Security review 2026-09-02, SEC-10 (backlog CODE-37). The two OpenAI Ads
-- bridge hooks verified every caller against one global variable and then
-- let the payload choose the tenant by slug, so any tenant's caller could
-- write another tenant's events. The connection row now names the variable
-- that holds its bridge secret, the same way `secret_name` names the
-- provider credential; the hooks resolve the tenant from the slug first and
-- verify against that tenant's variable. The default is the variable in use
-- today, so the one live connection keeps working with no change to the
-- website; a second tenant gets its own name and its own value.
-- Rollback: ALTER TABLE public.openai_ads_connections DROP COLUMN bridge_secret_name.
ALTER TABLE public.openai_ads_connections
  ADD COLUMN IF NOT EXISTS bridge_secret_name text NOT NULL DEFAULT 'OPENAI_ADS_BRIDGE_SECRET';

COMMENT ON COLUMN public.openai_ads_connections.bridge_secret_name IS
  'Name of the server environment variable holding this connection''s bridge secret. The value never enters the database.';
