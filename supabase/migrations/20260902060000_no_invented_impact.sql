-- A finding carries no revenue or traffic impact it never estimated.
--
-- Agent-runtime review 2026-09-02, AGT-3 (backlog CODE-51). Every rule
-- module copied its business impact into `revenue_impact` and
-- `traffic_impact`, so 111 of 115 recommendations read "revenue: high" or
-- "traffic: medium" on the strength of nothing: no revenue evidence is
-- collected anywhere and no rule estimates traffic. The modules no longer
-- write the two columns (the default, 'none', now means "not estimated" and
-- is rendered as such), and the rows they wrote are put back to that
-- default. Only rule-sourced rows whose two values equal the business impact
-- are touched, which is exactly the copy pattern; the seeded capability and
-- knowledge rows and the one hand-set Search Console row keep their values.
-- Rollback: the ids are on the activity event; SET revenue_impact =
-- business_impact, traffic_impact = business_impact WHERE id = ANY(ids).
INSERT INTO public.activity_events (tenant_id, actor_kind, actor_id, verb, subject_kind, subject_id, summary, payload)
SELECT r.tenant_id, 'system', 'migration:20260902060000', 'recommendation.impact_reset', 'tenant', r.tenant_id,
       count(*) || ' findings carried a revenue and traffic impact copied from their business impact; both now read not estimated.',
       jsonb_build_object('reason', 'copied_from_business_impact', 'ids', jsonb_agg(r.id))
FROM public.recommendations r
WHERE r.source_module IN ('search-console', 'ga4', 'dataforseo', 'pagespeed', 'umami',
                          'backlink-findings', 'competitor-discovery', 'site-audit', 'seo-validation')
  AND r.revenue_impact = r.business_impact
  AND r.traffic_impact = r.business_impact
  AND NOT (r.revenue_impact = 'none' AND r.traffic_impact = 'none')
GROUP BY r.tenant_id;

UPDATE public.recommendations r
SET revenue_impact = 'none', traffic_impact = 'none'
WHERE r.source_module IN ('search-console', 'ga4', 'dataforseo', 'pagespeed', 'umami',
                          'backlink-findings', 'competitor-discovery', 'site-audit', 'seo-validation')
  AND r.revenue_impact = r.business_impact
  AND r.traffic_impact = r.business_impact
  AND NOT (r.revenue_impact = 'none' AND r.traffic_impact = 'none');
