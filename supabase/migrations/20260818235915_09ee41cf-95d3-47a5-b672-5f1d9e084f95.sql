-- Remove duplicate observation schedule rows that have no workflow attached,
-- then bind the real ones to the tenant.
DELETE FROM public.schedules s
WHERE s.key IN ('gsc-daily-observe','ga4-daily-observe','umami-daily-observe')
  AND s.target_id IS NULL;

UPDATE public.schedules s
SET tenant_id = 'c94a41b3-08d0-4a6d-88f8-0dcb1eb4e2e6'
WHERE s.key IN ('gsc-daily-observe','ga4-daily-observe','umami-daily-observe')
  AND s.tenant_id IS NULL;

-- Repair any observation schedule missing its workflow link.
UPDATE public.schedules s
SET target_id = w.id, target_kind = 'workflow'
FROM public.workflows w
WHERE w.key = s.key
  AND s.target_id IS NULL;