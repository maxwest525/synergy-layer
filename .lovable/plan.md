# Remove the metered Firecrawl key, and fix the flag that would misreport once it is gone

Both of your readings are correct. Evidence gathered before writing this:

- `FIRECRAWL_API_KEY` is **not** in Project Settings → Secrets (23 secrets listed, it is not among them), and there is **no** Firecrawl connector connection in the workspace. It is also absent from the repository `.env`.
- Yet it is live in the deployed server environment: the connector ledger row for `firecrawl` in the database reads `integration_state: real`, `health: healthy`, `probe_outcome: success`, `last_checked_at: 2026-08-24 10:03 UTC`. That probe calls `api.firecrawl.dev/v1/team/credit-usage` with `Bearer ${env.FIRECRAWL_API_KEY}` and only runs at all when the catalog sees the variable as present. A success today means the deployed runtime still holds a working cloud key.
- `configured` on `/capabilities/systems` is derived from live env at request time (`describeConnectorReadiness(env)` in `src/lib/connectors/catalog.ts`, projected by `projectCurrentConnectorReadiness`), not from the stored row. So the row is reporting the environment truthfully.
- `src/lib/execution/execution.functions.ts:210` does read the cloud key directly: `Boolean(process.env["FIRECRAWL_API_KEY"])`. Every other caller goes through `firecrawlEndpoint(process.env)`, which prefers self-hosted. So after removal this one flag flips to "not connected" while rendering still works.

## 1. Where the key lives, and how to remove it

It is a platform-injected server environment variable left behind by the now-disconnected Firecrawl connector — it survives at the deployment env layer rather than in the project secret list, which is why the ledger sees it and the secrets list does not.

Removal, in order:

1. Attempt deletion of `FIRECRAWL_API_KEY` through the project secrets API. Deletion is the only write; nothing else in the environment is touched.
2. Re-run the operator "Check connections" action on `/capabilities/systems` so `syncConnectorReadiness` re-probes and rewrites the ledger.
3. Confirm the outcome with a read query: the `firecrawl` row must become `integration_state: pending` with `probe_outcome: missing_configuration`, and `selfhosted_firecrawl` must remain present.
4. If the deletion call reports the secret as unknown, it is held above the project layer and only you can clear it: Connectors (workspace root, owner/admin) or Project Settings → Secrets. In that case I stop and tell you exactly which surface to open rather than guessing.

Nothing else needs to change for the self-hosted path to keep working: `SELFHOSTED_FIRECRAWL_BASE_URL` and `SELFHOSTED_FIRECRAWL_API_KEY` are both present, and `firecrawlEndpoint()` already prefers them.

## 2. The smallest safe change

In `src/lib/execution/execution.functions.ts`, replace the direct env read with the shared chooser:

```ts
const rendererCredentialPresent = firecrawlEndpoint(process.env) !== null;
```

`firecrawlEndpoint` is a pure function over an env record with no server-only imports, so a top-level import from `../firecrawl-endpoint` is safe in this server-function module.

The readiness sentence built from that flag in `buildReadiness` names "a Firecrawl credential"; it will be reworded to say which deployment answers (self-hosted or metered cloud) so a proven read is not credited to the wrong one. `buildReadiness` is a pure exported function, so this stays testable without touching the handler.

Tests: add a case to the existing readiness test covering self-hosted-only env (flag true, no cloud key present).

## Other direct readers, and whether they break

| Place | Reads | Breaks after removal? |
| --- | --- | --- |
| `src/lib/execution/execution.functions.ts:210` | `process.env.FIRECRAWL_API_KEY` | Yes — this is the fix above |
| `src/lib/connectors/probes.server.ts` (`case "firecrawl"`) | cloud key | No, and correct as-is: that probe exists to test the *cloud* connector. With the key gone the catalog marks it missing and the probe is not attempted |
| `src/lib/web-research.server.ts` | `requireKey` union still admits `"FIRECRAWL_API_KEY"`, but the scrape path already uses `firecrawlEndpoint` | No. Dead type member plus a misleading throw message; both tidied |
| `src/lib/execution/execute.ts:524` | none — copy only | No, but the refusal text tells the operator to "connect the Firecrawl credential (FIRECRAWL_API_KEY)", which would be wrong advice. Reworded to name the self-hosted deployment first |
| `src/lib/title-h1-proposals.server.ts:82`, `src/lib/page-metadata-proposals.server.ts:74`, `src/lib/page-audit.server.ts:466` | none — copy only | No. All three already obtain their renderer through `createRenderedVerifier()`/`firecrawlEndpoint()`; only the error wording names the cloud variable and gets corrected |
| `src/lib/execution/execute.test.ts:616`, `src/lib/seo-runs/orchestrator.server.test.ts` | assert on / seed the cloud key | Tests only. The assertion follows the reworded copy; the orchestrator fixtures keep working either way |

No behavioural change to any scrape or render path: every one of them already routes through `firecrawlEndpoint()`.

## Order of work

Fix (2) and the copy first, run the gate (`lint`, `typecheck`, `test`, `build`), and only then remove the key — so the removal cannot produce a window where the execution screen misreports verification as unavailable.

## Records updated in the same change

`docs/context/CURRENT_BUILD.md`: the metered Firecrawl cloud key is removed by decision, rendered-page verification is self-hosted only, and the `firecrawl` connector row is expected to read pending from here on.
