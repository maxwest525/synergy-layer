# OpenSEO Runtime Design

## Goal

Make the self-hosted OpenSEO instance at `seo.marky.systems` a real AOOS runtime instead of a catalog entry. AOOS must discover the deployed OpenSEO MCP contract, expose every discovered capability to the operator, execute calls with explicit spend and mutation controls, and preserve returned evidence with tenant-scoped provenance.

## Verified source of truth

- Upstream repository: `every-app/open-seo`
- Upstream and deployed commit: `bd402844fae9101da9591b8eb153871773eb3c27`
- Deployed OpenSEO version: `0.1.4`
- Deployed MCP protocol: `2025-03-26`
- Deployed MCP tool count on 2026-08-16: 39
- VPS service: Docker container `openseo`, bound to `127.0.0.1:3003`
- Public route: `https://seo.marky.systems`, protected by Caddy Basic authentication

The live MCP `tools/list` response is authoritative. AOOS must not copy a static list of 39 tools into application code.

## Scope

### Included

1. Discover the complete OpenSEO MCP tool catalog at runtime.
2. Show all discovered tools in a dedicated AOOS OpenSEO workspace.
3. Show the exact input schema, read/write annotation, destructive annotation, and cost classification for each tool.
4. Execute any discovered tool through one generic, validated MCP call path.
5. Require a second explicit confirmation for any metered, mutating, or destructive call.
6. Record every completed invocation as tenant-scoped evidence, including tool, sanitized arguments, result, timing, status, OpenSEO version, MCP version, and credits reported by OpenSEO.
7. Expose OpenSEO discovery and safe free reads through AOOS MCP without allowing an external MCP client to bypass AOOS approval or spend controls.
8. Surface SAM's real status and link to its OpenSEO workspace.
9. Configure `OPENROUTER_API_KEY` on the VPS only through a secure local terminal flow; the value must never enter chat, git, logs, or AOOS tables.
10. Update the canonical OpenSEO system record from `not_connected` to callable only after a live authenticated proof succeeds.

### Excluded

- Reimplementing OpenSEO's UI or copying its business logic into AOOS.
- Copying the `seo-coach` skill into AOOS Knowledge Center.
- Automatic paid research, scheduled paid calls, or background SAM conversations.
- Storing Caddy, OpenRouter, DataForSEO, Google, or AOOS credentials in Supabase rows or source code.
- Claiming OpenSEO GSC, GA4, or SAM works until each is configured and a live operation proves it.

## Identity: SAM and Coach

SAM is OpenSEO's in-app SEO agent. It uses OpenRouter and the OpenSEO tool surface. The current VPS health response reports SAM disabled because `OPENROUTER_API_KEY` is absent.

`seo-coach` is a repository skill: an instruction workflow for an external agent using OpenSEO MCP. It is not a person, service, endpoint, or independent runtime. AOOS will expose the underlying MCP tools; importing that skill into AOOS Knowledge Center is intentionally outside this change.

## Architecture

### OpenSEO MCP transport

`src/lib/openseo/mcp.server.ts` owns JSON-RPC transport to `${OPENSEO_BASE_URL}/mcp`. It sends Caddy Basic authentication, a bounded timeout, MCP `initialize`, `tools/list`, and `tools/call`. It accepts JSON or SSE-formatted MCP responses, rejects malformed envelopes, and never returns provider headers or credentials.

### Dynamic capability classification

`src/lib/openseo/catalog.ts` converts live MCP tools into AOOS capability rows. Classification uses the live annotations and description:

- `free_read`: `readOnlyHint === true`, `destructiveHint !== true`, and no credit language.
- `metered_read`: read-only but the description states credits or provider cost.
- `mutation`: `readOnlyHint !== true` and not destructive.
- `destructive`: `destructiveHint === true`.

Any uncertain tool is treated as governed, never free-read. The UI can display all tools, but only `free_read` may execute without a confirmation token.

### Operator execution path

The server function authenticates the operator, resolves the active tenant, rediscovers the live tool by name, validates arguments against the live JSON Schema boundary, and applies the governance gate. Governed calls require `confirmed: true` from a second operator action. The server does not trust a client-supplied cost or mode.

### Evidence ledger

`public.openseo_tool_runs` is append-only. It stores:

- tenant and operator identity
- tool name and live classification
- sanitized arguments and complete structured result
- status and redacted error category
- start/completion timestamps and duration
- OpenSEO/MCP versions
- credits charged/remaining when the provider reports them
- source endpoint without embedded credentials

Authenticated tenant members can read their tenant's rows. Only the service role can insert. Updates and deletes are rejected.

### AOOS interface

`/openseo` is a single operator workspace using the existing AOOS visual system. It includes:

- live connection and SAM status
- project selector populated by the free `list_projects` call
- searchable/grouped tool catalog
- schema-driven JSON argument editor with project ID prefill
- explicit risk/cost explanation
- two-step confirmation for governed tools
- result viewer and recent invocation history
- direct link to SAM at the selected OpenSEO project route when available

The signature element is a compact live capability rail: category, mode, cost, and connection state are visible before a tool opens. No filled primary button is used as a persistent decorative element.

### AOOS MCP exposure

AOOS adds two stable tools:

- `list_openseo_tools`: discovers and returns the complete live catalog.
- `call_openseo_free_read`: executes only a tool currently classified `free_read`.

Metered or state-changing OpenSEO calls remain UI-only so external MCP clients cannot bypass the operator confirmation gate.

## Error handling

- Missing AOOS OpenSEO configuration: render a configuration-required state and do not call the provider.
- HTTP/auth failure: record no provider body; return a redacted actionable error.
- Timeout/network failure: return a bounded error and keep the prior evidence immutable.
- Malformed MCP response or missing tool: refuse execution.
- OpenSEO-reported tool error: store the structured error result with status `failed`; never label it successful because HTTP returned 200.
- Result body above the configured bound: cancel/reject and record `response_too_large` without storing the body.

## Spend and mutation controls

- Discovery, health, identity, project listing, and stored-state reads may run without provider-spend confirmation.
- Every call classified as metered, mutating, destructive, or uncertain requires a second explicit operator confirmation.
- No background or scheduled OpenSEO calls are introduced.
- The ledger records reported credits; absence of credit metadata is displayed as unknown, never zero.

## Verification

1. Unit tests prove JSON/SSE parsing, dynamic classification, schema validation, response bounds, and redaction.
2. Server tests prove operator/tenant scoping, second-confirmation enforcement, provider error handling, and immutable evidence writes.
3. Route tests prove all tools render and governed calls cannot execute from the first click.
4. AOOS MCP tests prove discovery and free-read access while metered/mutating calls are refused.
5. A live authenticated `whoami`, `list_projects`, and `tools/list` proves the VPS bridge without spending DataForSEO credits.
6. Full Vitest, TypeScript, ESLint, and production build gates pass before commit or push.

## Deployment and truth labels

Code, secrets, database migration, VPS configuration, and Lovable publish are separate states. The final report must state each independently. OpenSEO becomes `callable` only after production AOOS proves a live authenticated free call. SAM becomes `enabled` only after the VPS health endpoint reports the AI check configured and a user can open the SAM route.
