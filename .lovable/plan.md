# Phase 1.1 — Operator auth hardening + first real observation connector

Scope: Google sign-in with server-enforced access control, and Google Search Console promoted from `pending` to a real, read-only Capability Registry connector with an idempotent daily observation loop. No new workspaces, no SEO dashboard, no mutating Google actions.

## Part 1 — Google sign-in with provisioned access

**Sign-in**
- Add a "Continue with Google" outlined button on `/auth` next to the existing email/password form, using Lovable managed Google auth (identity scopes only: email, verified status, name, avatar). No Search Console, Ads, Drive, or Gmail scopes in the login flow.
- Email/password stays exactly as-is as break-glass admin login.

**Access control (server-enforced)**
- New table `authorized_operators`: verified email (unique, normalized lowercase), granted role, status, who granted it, when. Seeded with `admin@trumoveinc.com` as admin.
- New table `profiles` keyed to the auth user: verified email, display name, avatar, provider(s) seen. One row per user, matched by verified email so Google and password logins on the same address never create duplicates.
- A database trigger on new sign-up replaces today's "first user becomes admin" rule: a new user gets a role only if their **verified** email matches an `authorized_operators` row. No domain-suffix rule. Existing `user_roles` rows are respected and never duplicated.
- Unprovisioned users land on a gated screen showing: "Your Google account was verified, but access to AOOS has not been provisioned." They can sign out; they see no workspace data.
- RLS and `has_role` / `is_operator` remain the sole authority for every mutation. Nothing about the new tables loosens existing policies.

**Activity logging** (through the existing `activity_events` system): login succeeded, login failed, logout, access denied, account provisioned, role changed.

**Admin surface**: an operator/admin-only panel to view and manage `authorized_operators` (grant, revoke, change role) — placed inside the existing shell, not a new workspace.

## Part 2 — Google Search Console as a real capability

**Connection**
- Link the workspace Google Search Console connector to this project. All calls go through the Lovable connector gateway from server code. No OAuth tokens are ever stored in application tables.
- One honest constraint: this connector authorizes the workspace/company Google account, and Connect / Reconnect / Disconnect are performed in Lovable's connector settings, not by an in-app OAuth screen. The capability page will show real live connection state plus a clearly labeled action that routes the operator to the right place, rather than faking an in-app OAuth flow.

**Capability record** (`google-search-console`, kind `connector`, provider Google, category `organic-search`) exposes: connection status, health, authorized account, granted scopes (read-only), selected property, connected AOOS asset, last successful sync, last attempted sync, next scheduled sync, records received, data freshness, recent errors, connection owner, plus Run now and View runs.

**Property selection**
- After the connection is live, the capability page lists the verified properties returned by the connected account at runtime. Nothing is hardcoded, and URL-prefix vs domain properties are never guessed.
- An admin selects the TruMove production property; the selection is re-validated server-side against the live property list before it is saved, then attached to the existing TruMove Website asset. Only admins can change it. Connect and disconnect events are recorded in Activity.

**Ingestion (immutable snapshots)**
- New tables for connector runs and snapshots covering: daily site totals, landing-page performance, query performance, page+query pairs, device distribution, country distribution, and submitted sitemap status.
- Every snapshot records clicks, impressions, CTR, average position, property identifier, date range, dimensions used, retrieval timestamp, connector run ID, and a content checksum. Pagination handled where the API requires it.
- Snapshots are append-only. An identical checksum records a successful no-change run instead of writing duplicate rows. Failures never delete or invalidate prior snapshots or recommendations.

**Schedule**
- Workflow `gsc-daily-observe`, declared in the registry module (not hardcoded UI), running daily on America/New_York via the existing scheduler, executed through the existing DAG runner so every step is visible as completed / skipped / failed / waiting.
- Because Search Console lags, each run analyzes only through the latest complete reporting date; today is never treated as complete.
- Run steps: verify connector and property → fetch newest complete data → validate → write snapshot → compare to prior equivalent period → generate observations → create or update recommendations → emit activity → update capability and schedule health.

**Recommendation rules**
- Rules implemented as typed, configurable definitions with thresholds stored in workflow configuration, not literals in execution code: striking-distance queries, high-impressions/low-CTR pages, pages losing clicks/impressions/position, queries gaining visibility, impressions with zero clicks, important pages missing from data, sitemap warnings or errors, Research pages gaining traction, cannibalization (multiple pages on one query), and significant period-over-period swings.
- Each recommendation carries: triggering rule, exact page/query/sitemap, current period, comparison period, current and previous metric values, absolute and percentage change, property, snapshot ID, run ID, confidence, affected asset, suggested next action, approval requirement.
- Revenue, lead, and traffic impact are rendered as "Not yet quantified" until GA4 and conversion data exist. No fabricated forecasts, and no recommendation is created just to populate a screen.

**Deduplication**
- Stable fingerprint over property + rule + page/query + reporting period. A persisting issue updates the existing open recommendation with fresh evidence; a resolved issue is marked resolved and logged in Activity.

**Approval semantics**
- Observation only. Recommendations can be reviewed, approved, rejected, deferred, or resolved, and approval performs no write to the website, metadata, sitemaps, or Search Console. No mutating Google call exists anywhere in this change.

**UI, inside existing workspaces only**
- Capability Registry: connection state, scopes, property, health, freshness, run history, errors.
- Assets: Search Console shown as a connection on the TruMove Website asset with organic-search health, related recommendations, and runs.
- Workflows: `gsc-daily-observe` with real DAG execution detail.
- Scheduler: daily schedule, last run, next run, duration, failures, Run now through the same execution path.
- Recommendations: real evidence with the source snapshot, no placeholders.
- Inbox: only actionable or failed items; successful syncs do not enter Needs Attention.
- Activity: authorization, sync, observation, recommendation, review, and failure events.

## Technical notes

- Migrations: `authorized_operators`, `profiles`, `gsc_connections` (property selection + connection metadata, no tokens), `gsc_runs`, `gsc_snapshots`, `gsc_snapshot_rows`, `recommendation_fingerprints`. Each with GRANTs, RLS enabled, and role-scoped policies in the same migration. Replace `handle_new_user` with the allowlist-based version.
- All Search Console access lives in server-only modules called from `createServerFn`, reusing `os.server.ts`, `workflow-runner.server.ts`, and `scheduler.server.ts`. No new execution engine.
- Rule thresholds live in typed config attached to the workflow record so they can be tuned without a code change.
- Failure handling: empty data, expired authorization, missing property, quota errors, and API errors each fail safe — run marked failed, capability health degraded, Inbox item filed, prior snapshots untouched.

## Out of scope

Google Ads, GitHub runtime capability, sitemap submission or any mutating Google permission, per-end-user Google OAuth, and any standalone SEO dashboard.
