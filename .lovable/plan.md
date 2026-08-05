# Phase 1.1 — Operator authentication and the first read-only observation connector

Scope is unchanged: Google sign-in plus allowlisted operator provisioning, and a read-only Google Search Console observation loop that feeds the existing Assets, Capability Registry, Workflows, Recommendations, Scheduler, Inbox, and Activity architecture. No new workspace, no SEO dashboard, no mutating Google action.

## Preflight findings (confirmed before planning)

- The backend currently has **zero accounts**: no rows in `auth.users`, no rows in `public.user_roles`. There is no existing administrator identity to preserve, so nothing can be locked out by a new uniqueness constraint.
- Consequence: the "first signup becomes admin" trigger has never fired. It will be replaced rather than migrated around.
- Confirmed admin identity to seed: **Admin@trumoveinc.com**, role `admin`, stored normalized (lowercased, trimmed) for lookup.
- First sign-in method: **Google only**. No password account is created for the admin.
- Connector scope: **`https://www.googleapis.com/auth/webmasters.readonly` only**. No site-verification, sitemap-management, or full webmasters scope is requested at connect time.

The preflight duplicate audit still ships as part of the migration (guarded by an assertion) so a re-run on any future environment with real users cannot silently break.

## Part 1 — Authentication and operator provisioning

### Identity model

- `profiles.id uuid primary key references auth.users(id) on delete cascade`, plus `email`, `email_normalized`, `display_name`, `avatar_url`. The auth user UUID is the permanent identity key.
- No account-merging logic. Identity linking for the same verified email across Google and password is left to the auth provider.
- `authorized_operators`: `email_normalized` (unique), `role` (`admin` | `operator`), `granted_by`, `granted_at`, `revoked_at`, `note`. Seeded with `admin@trumoveinc.com` → `admin`.
- The unique constraint on `profiles.email_normalized` is applied only after an in-migration audit confirms zero duplicates across `auth.users` and `auth.identities`; on a duplicate it raises and aborts.

### Provisioning

`public.provision_operator_from_allowlist(_auth_user_id uuid)` — security definer, idempotent:

1. Requires `email_confirmed_at is not null`; otherwise returns "unverified" without granting.
2. Matches `authorized_operators` on normalized email where `revoked_at is null`.
3. Inserts or updates exactly one `user_roles` row; never duplicates; never downgrades an existing higher privilege (`admin` > `operator` > `viewer`).
4. Emits `operator_provisioned`, `operator_provision_skipped`, or `operator_access_denied` into `activity_events`.

Called from: post-authentication server path, post email verification, on grant or change of an authorized operator, and from an admin "retry provisioning" action.

`public.revoke_operator(_email text)` runs in one transaction: sets `revoked_at`, deletes the matching `user_roles` row, emits `operator_revoked`. Because `has_role` and `is_operator` read `user_roles` live, an existing session immediately stops passing those checks.

The `on_auth_user_created` trigger is rewritten: it creates the `profiles` row and calls the provisioning function. It is never the sole grant path, and the "first user becomes admin" behaviour is removed.

**Last-admin protection.** Revocation and demotion both run a guard that counts active `admin` rows in `user_roles`. If the change would leave zero active admins, it raises and aborts with a clear message: a second admin must be granted first. This applies to `revoke_operator`, role downgrades, and allowlist edits.

### Sign-in surface

- `/auth` keeps email/password and gains Google sign-in via the Lovable managed broker.
- Google sign-in uses an explicit callback route: `redirect_uri` is `${window.location.origin}/auth/callback` (public, not gated). That route validates the returned session server-side, runs allowlist provisioning, records the audit event, then redirects into AOOS at the saved same-origin destination (default `/`). The site origin is not relied on alone.
- No client-side role decision: the resulting role always comes back from the server function.


### Audit events

All auth audit rows are written server-side only. `activity_events` gains no client insert policy for auth verbs; writes go through the service-role path inside server functions. Recorded: `login_succeeded`, `access_denied`, `operator_provisioned`, `operator_revoked`, `role_changed`, `logout`. Failed logins are recorded by a rate-limited server endpoint that stores only email-normalized, reason code, and timestamp. No passwords, tokens, OAuth payloads, or raw provider errors are stored.

## Part 2 — Google Search Console observation connector

### Connector and scope

Connect the Google Search Console connector with the read-only scope only. It registers in the Capability Registry as a `connector` capability with `integration_state: real`, operations limited to: list properties, query search analytics, list sitemap status. No submit, delete, verify, or inspect operation is declared.

### Connection and property events

AOOS never claims it connected or disconnected anything. It records observations only:
`connection_status_observed_connected`, `connection_status_observed_disconnected`, `connection_status_observed_degraded`, `property_selected`, `property_changed`. Actor and action time are recorded only when the gateway returns them authoritatively; otherwise actor is `system` and the event is labelled as an observation.

Property resolution follows list → select → pass: verified properties are listed at runtime, multiple matches return `selection_required` to a no-default picker, and the chosen value is re-validated server-side before any per-site call.

### Snapshots

New table `search_console_snapshots`, one row per collection run, storing the response plus the complete query definition:

- `property`, `search_type` (`web`), `dimensions`, `filters`, `aggregation_type`, `response_aggregation_type`, `data_state` (`final`), `row_limit`, `paginated_request_count`, `returned_row_count`, `reporting_timezone` (`America/Los_Angeles`), `possibly_truncated` boolean, `api_query_version`, `checksum`
- `period_start_pt`, `period_end_pt` stored as Pacific dates
- `kind`: `property_totals` | `dimensional_rows` — provenance in the UI distinguishes official property totals, API-returned dimensional rows, and potentially incomplete detailed datasets.

Every Search Analytics request sets `dataState: "final"`. The latest finalized date is discovered by querying recent data grouped by date and taking the newest date with data — no hardcoded lag. The scheduler may run in America/New_York; reporting periods stay explicitly labelled Pacific Time.

### Aggregation rules

- Site totals come from an ungrouped property-level query, never from summing dimensional rows.
- CTR = total clicks / total impressions.
- Average position is impression-weighted; row-level positions are never arithmetically averaged.
- Lower position is an improvement.
- Percentage change against a zero baseline is `null` / "Not applicable", never infinity.
- Values produced with different aggregation types are never compared.

### Rules and recommendations

Rules run over stored snapshots and file into the existing Recommendation Queue and Inbox:

- Impression or click decline against a comparable prior period
- Position decline on meaningful-impression queries
- High-impression, low-CTR pages
- `possible_query_overlap` (renamed from cannibalization): fires only when multiple pages take meaningful impressions on the same query, the condition persists across configurable periods, and minimum evidence thresholds pass. It never asserts confirmed cannibalization from one snapshot.
- Absent page copy is fixed to: "No Search Console performance data was returned for this page during the selected period." No indexing claims anywhere.

Deduplication uses two fingerprints:

- `issue_fingerprint` = property + rule + target (page/query/sitemap) — keeps a single open recommendation for a continuing problem, updated with new evidence.
- `observation_fingerprint` = issue_fingerprint + reporting period + snapshot id — prevents the same period/snapshot being attached twice.

### Lifecycle

Approving a Search Console recommendation changes only its AOOS lifecycle state. It cannot edit the website, change metadata, create content, submit a sitemap, request indexing, alter Search Console, or trigger any mutating connector. This is enforced by the capability declaration having no mutating operation to call.

### Scheduling and failure behaviour

A daily workflow (`search-console-observe`) runs collection → rule evaluation → recommendation filing, registered through the existing registry and scheduler. Missing authorization, missing property, quota errors, and API failures fail the run safely, file an Inbox item in Needs Attention, and leave all previous snapshots intact and readable.

## Technical notes

- Migrations: `profiles`, `authorized_operators`, `search_console_snapshots`, `search_console_observations` — each with GRANTs, RLS, and policies in the same migration; audit assertion before the unique email constraint.
- New server modules: `src/lib/auth-provisioning.server.ts`, `src/lib/search-console.server.ts` (list/select/query helpers, finalized-date discovery, pagination), `src/lib/search-console-rules.server.ts`.
- Registry: `src/registry/modules/search-console.ts` declares the capability, the workflow, and the schedule.
- Existing Phase 1 workspaces, routes, and behaviour are untouched apart from additive wiring.
