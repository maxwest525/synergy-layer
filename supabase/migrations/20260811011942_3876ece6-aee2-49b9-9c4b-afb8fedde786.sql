-- Signed-out visitors must have no direct privilege on any advertising table.
-- The row-level rules already denied them, but a table grant that no policy
-- backs is a latent hazard rather than a defence.
REVOKE ALL ON public.ad_advertiser_candidates FROM anon;
REVOKE ALL ON public.ad_advertisers FROM anon;
REVOKE ALL ON public.ad_vendor_watchlist FROM anon;
REVOKE ALL ON public.ad_vendor_advertisers FROM anon;
REVOKE ALL ON public.ad_creatives FROM anon;
REVOKE ALL ON public.ad_creative_families FROM anon;
REVOKE ALL ON public.ad_destination_pages FROM anon;
REVOKE ALL ON public.ad_live_serp_observations FROM anon;
REVOKE ALL ON public.serpapi_requests FROM anon;

-- Review history is not erasable from the app. Corrections are new decisions.
REVOKE DELETE ON public.ad_advertiser_candidates FROM authenticated;
REVOKE DELETE ON public.ad_advertisers FROM authenticated;