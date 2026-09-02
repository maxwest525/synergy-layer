-- Google Ads rows carry the campaign's budget.
--
-- Paid review 2026-09-02, PAID-1 (backlog CODE-65). The campaign-day report
-- stored spend and conversions and nothing about the ceiling the spend runs
-- against, so a campaign at its daily budget and one far under it read the
-- same. The GAQL now selects campaign_budget.amount_micros and the row keeps
-- it; null means the API reported no budget, never 0.
-- Rollback: ALTER TABLE public.google_ads_snapshots DROP COLUMN budget_micros;
ALTER TABLE public.google_ads_snapshots
  ADD COLUMN IF NOT EXISTS budget_micros bigint;
