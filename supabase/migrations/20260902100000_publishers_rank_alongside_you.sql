-- Moving-niche publishers rank alongside you; they are not web platforms.
--
-- Competitor review 2026-09-02, COMP-2 (backlog CODE-62). The SERP-derived
-- classifier carried a hard-coded list of "surface" domains that mixed
-- general web platforms (Facebook, YouTube, Wikipedia, Yelp) with nine
-- moving-niche publishers and marketplaces (moving.com, movers.com,
-- unpakt.com, hireahelper.com, updater.com, uhaul.com, move.org,
-- movebuddha.com, mymovingreviews.com). The research log names moveBuddha
-- and Moving.com as the route-matrix rivals; the classifier filed them as
-- surfaces, which the competitor screen never presents as competitors.
-- domain_class is SERP-derived ("does this domain rank alongside us");
-- what the business is (publisher_directory) is the operator's declaration
-- in company_classification, and one is never derived from the other.
--
-- Rows already derived with the old list are corrected here; a later
-- derivation pass upserts the same rows and would reach the same answer.
-- Rollback: the reverse UPDATE on the same domains.
UPDATE public.competitor_candidates
   SET domain_class = 'competitor'
 WHERE source = 'serp.derived'
   AND domain_class = 'surface'
   AND domain IN (
     'moving.com', 'movers.com', 'unpakt.com', 'hireahelper.com', 'updater.com',
     'uhaul.com', 'move.org', 'movebuddha.com', 'mymovingreviews.com'
   );
