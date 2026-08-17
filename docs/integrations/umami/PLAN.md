# Umami integration plan

Scope: replace the empty GA4 traffic lane in Evidence with real, stored traffic
facts from the operator's self-hosted Umami. Read only. No mutations exist in
this integration, so no approval gate is required for observation.

## Capability map

| AOOS need | Umami source | State today |
| --- | --- | --- |
| Sessions and visitors per day | `/api/websites/{id}/stats` | pending |
| Traffic trend | `/api/websites/{id}/pageviews` | pending |
| Landing page performance | `/api/websites/{id}/metrics?type=url` | pending |
| Referral and channel mix | `/api/websites/{id}/metrics?type=referrer` | pending |

## Blueprint

1. Secrets: `UMAMI_BASE_URL` plus either `UMAMI_API_KEY` or
   `UMAMI_USERNAME` and `UMAMI_PASSWORD`. Server side only.
2. `src/lib/umami/client.server.ts`: token acquisition with in-request caching,
   bearer or api-key header selection, typed errors for 401, 429, and 5xx.
3. Migration: `umami_snapshots` table, immutable, tenant scoped, unique on
   (tenant_id, website_id, metric, period_start, period_end). GRANTs plus RLS
   restricted to tenant members. No credentials stored in the row, only
   provenance.
4. `src/lib/umami/observe.server.ts`: daily observation writing snapshots,
   idempotent per window, transient retry with backoff, degraded rather than
   failing on transient faults.
5. Registry: declare `cap.umami` in `src/registry/modules/` with state driven by
   stored snapshots, never by the presence of a secret.
6. Evidence UI: a traffic panel reading only stored snapshots, labelled Umami,
   never labelled GA4.
7. Workflow: register `umami-daily-observe` alongside `gsc-daily-observe`.

## Risk register

| Risk | Mitigation |
| --- | --- |
| Credential rotation breaks reads silently | 401 surfaces as a Broken system-health row, never as zero traffic |
| Umami metrics mistaken for GA4 | Every surface names the source; GA4 stays "not connected" until its own read succeeds |
| VPS downtime | Heartbeat check before each run; a failed run stores a failure record, not a gap |
| Self-hosted instance exposed publicly | Credentials stay server side; AOOS never proxies the instance to the browser |

## Approval gate

Implementation starts only after the operator supplies credentials and approves
this plan. Nothing in this file has been executed yet.
