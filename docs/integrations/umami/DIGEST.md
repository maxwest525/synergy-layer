# Umami digest (self-hosted)

Discovered 2026-08-17. Source: live instance probe plus Umami v2 public API docs
(https://umami.is/docs/api). This digest is authoritative for AOOS until re-verified.

## Instance

- Base URL: `https://analytics.marky.systems`
- Host: operator VPS 212.227.242.130, publicly reachable over HTTPS
- `GET /api/heartbeat` returns `{"ok":true}` unauthenticated, so the instance is live
- `GET /api/websites` returns `401 unauthorized` without credentials, so the Data API is protected
- `GET /api/auth/verify` returns `405`, confirming the v2 auth routes exist and are POST only

## Authentication

Two supported schemes. AOOS uses whichever the operator provisions, server side only.

1. Token login: `POST /api/auth/login` with `{ "username", "password" }` returns
   `{ token, user }`. Send it as `Authorization: Bearer <token>` on later calls.
   Tokens are long lived but must be treated as rotatable.
2. API key: send `x-umami-api-key: <key>` on every call. Available on newer builds.

Credentials live in server secrets only. They are never written to
`tenant_connections`, never returned to the browser, and never logged.

## Endpoints AOOS needs

| Purpose | Call |
| --- | --- |
| Liveness | `GET /api/heartbeat` |
| List properties | `GET /api/websites` |
| Site totals | `GET /api/websites/{id}/stats?startAt={ms}&endAt={ms}` |
| Time series | `GET /api/websites/{id}/pageviews?startAt&endAt&unit=day&timezone` |
| Top pages | `GET /api/websites/{id}/metrics?startAt&endAt&type=path` |
| Referrers | `GET /api/websites/{id}/metrics?startAt&endAt&type=referrer` |

`startAt` and `endAt` are epoch milliseconds. `stats` returns pageviews, visitors,
visits, bounces, and totaltime, each as `{ value, prev }`.

Live revalidation on 2026-08-18 confirmed that this deployed Umami version rejects
`type=url` with HTTP 400 and accepts `type=path`. AOOS therefore uses `path` for
top-page metrics on this instance.

`GET /api/websites/{id}/metrics` also accepts `limit` (optional, default 500)
and `offset` (optional, default 0) query parameters. Verified against
https://docs.umami.is/docs/api/website-stats on 2026-08-31: "limit (optional,
default 500) Number of rows returned." AOOS sends no `limit`, so the provider
applies its own 500-row default; `fetchUmamiMetrics` then slices the response
to `UMAMI_RULE_THRESHOLDS.referrer.appSliceLimit` (25) client side
(`umami-rule-checks.ts`). A rule reasoning about whether a stored referrer list
is complete must compare against the smaller of the two limits, not assume our
own 25-row slice is what bound the read.

## Limits and risks

- No published rate limit on self-hosted instances. AOOS still throttles to one
  observation run per site per day plus explicit operator refreshes.
- Umami counts visits with its own cookieless heuristic. It is not GA4 and its
  numbers must never be presented as GA4 numbers.
- The instance is single tenant. Every stored snapshot is bound to the AOOS
  tenant that owns the run, with provenance recording base URL, website id,
  request window, and fetch timestamp.
- A 401 means expired or rotated credentials, not zero traffic. Missing data is
  recorded as a failure, never as zero.

## Truth rule

Umami is `pending` in the Capability Registry until one authenticated read
stores an immutable snapshot. Only then does it become `real`.
