# Remediation plan, the Firecrawl history, and the unused tool surface

Written 2026-08-25 at `cb586dd`. Companion to
[`../integrations/CATALOG.md`](../integrations/CATALOG.md) (the audit) and
[`../context/CODEBASE-MAP.md`](../context/CODEBASE-MAP.md) (the map). This file
answers three questions: **what to do about each finding**, **what the Firecrawl
argument was actually about**, and **what our integrations expose that nothing
uses**.

Every fix below has a verification step.

**Two items changed on contact with the code, and both corrections are recorded
in place rather than edited away:** item 2's obvious fix turned out to risk the
deployed build, and **item 3b was simply wrong — the fix already existed.** If
you read only one thing here, read 3b: the mistake in it is more instructive than
the finding was.

---

# Part 1 — What to do to correct what is wrong

Ordered by value per unit of effort. Items 1–3 are small and worth doing
together; 4–6 need a decision from Max first.

## 1. Wire the GA4 connector probe

**Problem.** `google_analytics_4` sits in `noSafeProbe`
(`src/lib/connectors/probes.server.ts:34-39`) and reports
`configured_no_safe_probe` forever, on the stated grounds that GA4 needs
service-account JWT signing first. **That signing already exists in this repo**,
in `src/lib/measurement/ga4.server.ts`, and is covered by tests.

**Why it is small.** A connector probe does not need to read a report. It needs
to answer one question: *is the stored credential accepted?* GA4's
`accessToken(env)` (`ga4.server.ts:233`) answers exactly that — it picks the
service-account path or the OAuth-refresh path via `readGa4EnvPresence`, and
throws `Ga4ProviderError` if neither is complete. A successful token exchange
against `oauth2.googleapis.com` is free and reads nothing.

This is the same shape `google_ads` already uses: exchange first, then decide.

**Steps.**

1. Export `accessToken` from `src/lib/measurement/ga4.server.ts:233` (it is
   currently module-private). Consider renaming it `ga4AccessToken` at the same
   time — `accessToken` is too generic for a public export.
2. Create `src/lib/connectors/ga4.server.ts`, mirroring the structure of
   `src/lib/connectors/google-ads.server.ts` (133 lines is the whole reference
   implementation). It should:
   - call `ga4AccessToken(env)`;
   - on success return `health: "healthy"`, `outcome: "ok"`, and
     `proof: { endpoint: "https://oauth2.googleapis.com/token", credentialKind }`
     — `credentialKind` is already returned and tells Max *which* credential
     answered, which is genuinely useful on that screen;
   - on `Ga4ProviderError` return `health: "failing"` with the error's
     `httpStatus`, and use `ga4ResponseProvesAuthentication(status)`
     (`ga4.server.ts:55`) to distinguish "credential rejected" from "Google
     answered but refused the read".
3. In `probeConnector` (`probes.server.ts:298`), add a dispatch branch beside the
   Google Ads one at line 302:
   ```ts
   if (key === "google_analytics_4") {
     const { probeGa4 } = await import("./ga4.server");
     return probeGa4(options);
   }
   ```
4. Remove `"google_analytics_4"` from the `noSafeProbe` set at line 36.

**Do not** make the probe call `runReport`. It would need a property id the probe
has no access to, and it would consume GA4 quota on a health check. The token
exchange is the honest boundary of what a probe should prove.

**Verification.** Add a test to `probes.server.test.ts` in the shape of the
existing *"refreshes Google Ads OAuth and probes the current read-only v25
endpoint"* case (line 250): mock the token endpoint, assert the probe reports
healthy and that **no** call to `analyticsdata.googleapis.com` is made. Then
`npm test` and check the `/capabilities/systems` row after a deploy.

**Effort:** one small module plus a test. **Payoff:** removes a permanently amber
row and turns a guess into an answer.

## 2. Untrack `.env`

**Problem.** `git ls-files .env` matches — the file is tracked. `.gitignore` (32
lines) has no `env` entry. Today the file holds six values, all publishable
(`SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and their
`VITE_` twins), so **nothing secret is exposed right now**. The risk is entirely
prospective: the next secret written there is committed by default, and it would
be committed to a repository Lovable's bot also pushes to.

**CORRECTED 2026-08-25, while implementing this.** The obvious fix —
`git rm --cached .env` — is **wrong here**, and two facts settle it:

1. **`.env` is Lovable's file, not a hand-written one.** `git log -- .env` shows
   it was committed by `gpt-engineer-app[bot]`, Lovable's bot, in `3ddc7a0`. It
   belongs to the same category as `src/routes/mcp.ts` and
   `previewAuthStorage.ts`: generated infrastructure the bot re-creates. Fighting
   it means losing.
2. **Untracking it risks the deployed client.**
   `src/integrations/supabase/client.ts:36-38` reads
   `import.meta.env["VITE_SUPABASE_URL"]` and
   `import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]`, which Vite bakes in **at
   build time**. `.env.example` contains **no `VITE_` names at all**, so the
   repo's own template does not treat these as operator-supplied. If Lovable
   builds from the checkout and does not separately inject them, removing `.env`
   produces a client that cannot reach Supabase. That was not worth risking to
   close a prospective problem.

**What the risk actually is.** Not the current contents — six values, all
publishable. It is that `.env` is a tracked file that *looks* like the place a
secret goes, and the next secret written there is committed by default.

**What was done instead.** `.gitignore` now ignores `.env.local` and
`.env.*.local` — which Vite loads at **higher precedence** than `.env`, and which
Lovable does not manage — with a comment on the entry explaining that `.env`
itself is Lovable's and must never receive a secret. `.serena/` is ignored in the
same change. `.env` stays tracked, deliberately.

**Verification.** `git status --porcelain` no longer lists `.serena/`; `.env`
remains tracked and unchanged; the deployed build is untouched.

**CLOSED 2026-08-25 — `.env` stays tracked, and there is now direct evidence.**
The published client bundle at
`https://trumove.marky.systems/assets/index-DY68C5IC.js` (578 KB) was fetched and
searched: it contains the Supabase project ref `zrfzllupoccmztyweznq` **and** an
`sb_publishable_` key, inlined. So Vite did resolve `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` at build time and bake them into the shipped
JavaScript.

Combined with the three facts already established — `.env` is tracked and holds
exactly those two values, `.env.example` declares no `VITE_` names at all, and
Lovable's own bot committed `.env` — the mechanism is that Lovable builds from
the checkout and Vite reads `.env`. Removing it would remove the only in-repo
source of two values the client cannot start without.

**Do not untrack `.env`.** Treat it as Lovable-owned generated infrastructure,
like `src/routes/mcp.ts` and `previewAuthStorage.ts`. The protection that matters
is already in place: `.env.local` and `.env.*.local` are gitignored at higher
Vite precedence, and the gitignore comment states that `.env` must never receive
a secret.

*Note on a related-sounding thing that is not related:* `GITHUB_EXECUTOR_TOKEN`
targets `GOVERNED_REPO = "maxwest525/brittmove-829a7519"`
(`src/lib/execution/allowlist.ts:17`) — the customer site AOOS commits approved
page changes to. It is not part of how AOOS itself is built or deployed, and says
nothing about the build environment either way.

**Note on history.** The values in git history are publishable, so there is
nothing to rotate and no reason to rewrite history — which would break Lovable's
sync. Do not be talked into a `filter-repo` here.

## 3. Delete the SearXNG connector row

**Problem.** `SEARXNG_BASE_URL`, `SEARXNG_USERNAME` and `SEARXNG_PASSWORD` are
catalogued (`connectors/catalog.ts:202-208`) and probed
(`probes.server.ts:142-146`) and read by **nothing**. The standing decision is
that SearXNG is not wanted. A registered connector that nothing calls is the
exact failure mode that lets a dashboard look connected while nothing is: it
occupies a row, invites someone to place credentials, and rewards them with
nothing.

**Steps.**

1. Remove the `searxng` item from `CONNECTOR_CATALOG` (`catalog.ts:202-208`).
2. Remove the `case "searxng":` branch from `configuredRequest`
   (`probes.server.ts:142-146`).
3. Remove `"searxng"` from the `ConnectorKey` union (`catalog.ts:~14`).
4. Check `connectors/surface-inventory.ts` for a SearXNG entry and remove it too.
5. TypeScript will point at any remaining reference — the union is the guard.

**Verification.** `npm run typecheck` clean, `npm test` green, and the ledger
shows 18 rows rather than 19.

**If Max would rather keep the row**, the alternative is to say so in the catalog
comment — but do not leave it unexplained, because the next audit will flag it
again.

## 3b. WITHDRAWN — the cache fix was already in place

**This item was wrong and is retracted.** It claimed AOOS never sends Firecrawl's
`maxAge` parameter, leaving change-verification scrapes able to read a two-day
cache and prove the pre-edit page.

**What is actually true at `cb586dd`:**

- `src/lib/execution/execute.server.ts:271` `buildRenderedScrapeRequest()` sends
  `maxAge: 0`, with the comment *"Publish proof must never use Firecrawl's
  two-day default cache."* It is the only scrape body on the verification path —
  line 296 posts it.
- `src/lib/page-audit.server.ts:119` sends `maxAge: 0` too.
- Both also send `onlyMainContent: false` **explicitly**, so the second half of
  the claim — that the page audit inherited the vendor default of `true` — was
  also wrong.
- `src/lib/execution/execution.functions.ts:218` does not scrape at all. It calls
  `firecrawlEndpoint(process.env)` only to report whether a renderer credential
  is present, for the UI. It was never a call site.

**Where the error came from.** The request bodies were read by grepping for
`formats:` and inferring the rest of each object from the single matched line.
That is asserting an absence from a partial scan. A grep for `maxAge` — the thing
actually being claimed absent — would have taken one command and returned the
answer immediately.

**What survives.** Only the two non-verification callers omit `maxAge`:
`web-research.server.ts:89` and `dataforseo/competitor-pages.server.ts:85`. For a
cited-source read and a competitor-page read a two-day cache is defensible and
cheaper on metered cloud. **No change recommended.** If a rule ever starts
depending on competitor-page freshness, revisit then.

## 4. Decide Google Ads — needs Max

**Problem.** The whole Google Ads integration is
`src/lib/connectors/google-ads.server.ts`, 133 lines: an OAuth refresh, then one
call to `googleads.googleapis.com/v25/customers:listAccessibleCustomers`. There
is no reporting call, no spend read, no campaign data, and no product surface
that consumes any. `/ads` and `/ads/advertisers` are the **OpenAI Ads** CAPI
screens, not Google Ads.

`GOOGLE_ADS_CUSTOMER_ID` is required as a credential (`catalog.ts:166-175`) and
normalized (`catalog.ts:241` strips non-digits) and **read by no call** —
`listAccessibleCustomers` takes no customer id.

So placing four Google Ads secrets buys exactly one thing: a green row.

**Two honest options.**

- **Wire it.** Add a real read — most likely a `searchStream` campaign or spend
  query scoped by `GOOGLE_ADS_CUSTOMER_ID` — and a surface that shows it. This is
  real work and should be planned, not slipped in.
- **Remove it.** Delete the catalog row, the probe module and the four env names,
  the same way as SearXNG above. Stop asking for credentials the product cannot
  spend.

**Do not leave it as-is.** The current state costs Max time placing secrets and
returns nothing, which is precisely the complaint about connectors taking too
long.

**Calendar item either way.** v25 was announced July 2026 and its reference docs
were updated 2026-08-19, so it is current — but Google ships three versions a
year and maintains three at a time. This pin expires on a schedule; put a
reminder somewhere durable rather than rediscovering it at sunset.

## 5. Decide the Gemini bypass — needs Max

**Problem.** Two model paths exist and only one honours the rule that LLM calls
go through LiteLLM.

- Through the gateway: `src/lib/ai/routing.ts` → `ai/gateway.server.ts:26`, used
  by `next-actions.server.ts`, `routes/api/agent-chat.ts`,
  `routes/api/studio-chat.ts`.
- Direct to Google: `src/lib/gemini.server.ts:19`
  (`:generateContent`) and `src/lib/knowledge/embeddings.server.ts:78,108`
  (`:batchEmbedContents`, `:embedContent`), used by
  `page-metadata-proposals.server.ts`, `title-h1-proposals.server.ts` and
  `knowledge/runtime.server.ts`.

It is deliberate — the test is named *"calls Google directly with a strict
wording-only JSON schema"* — and there may be a good reason, most plausibly that
the strict `responseSchema` behaviour is a Gemini-native feature that did not
survive an OpenAI-compatible proxy. **But that reason is not written down
anywhere**, and from the outside it reads as the exact pattern that hides spend
for months.

**Steps.**

1. Establish whether LiteLLM passes Gemini's `responseSchema` through intact.
   This is the whole decision — everything else follows.
2. **If yes:** route both modules through `ai/routing.ts`. `gemini.server.ts`
   keeps its schema-building logic and loses only its hardcoded origin.
3. **If no:** leave the code alone and write the exemption into
   `src/lib/gemini.server.ts` as a comment naming the feature that forced it, in
   the same style as the `firecrawl-endpoint.ts` header. An undocumented bypass
   is the problem; a documented one is a decision.
4. **Either way, add a spend ceiling.** `gemini.server.ts` has a 20s timeout
   (line 21) and no retry, but no budget guard at all. DataForSEO's
   `assertBudget` / `recordSpend` pattern (`dataforseo/budget.server.ts:88-95`)
   is the model to copy — a per-tenant monthly row with a hard stop. Right now
   Gemini is the only metered provider in the repo with no ceiling.

**Verification.** For step 2, the existing `gemini.server.test.ts` asserts the
exact URL — it will fail loudly and correctly, and updating it is the proof. For
step 4, a test that `assertBudget` throws before the fetch.

## 6. Give the OpenAI Ads CAPI bridge a connector row

**Problem.** `src/lib/openai-ads/` is a full integration — 10 modules, two public
inbound webhooks (`routes/api/public/hooks/openai-ads-conversions.ts` and
`openai-ads-events.ts`), authenticated by `OPENAI_ADS_BRIDGE_SECRET` and
`OPENAI_ADS_CAPI_BRIDGE_SECRET`, with its own config module
(`openai-ads/config.ts`). It is **not in `CONNECTOR_CATALOG`**, so it has no row
on `/capabilities/systems` and no probe.

This is the only **outbound-write** integration in the repo that the connector
ledger cannot see. Everything else on that screen reads; this one delivers
conversion events.

**Steps.** Add a catalog item with
`credentialStrategies: [["OPENAI_ADS_BRIDGE_SECRET"]]` and whatever config the
bridge requires, and either a free liveness probe or an explicit `noSafeProbe`
entry — the second is fine and honest if no free endpoint exists, and is what
`perplexity` already does.

**Verification.** The row appears; `npm test` green.

## 7. Small corrections worth doing while nearby

- **`connectors/surface-inventory.ts:558`** still describes the Firecrawl
  fallback as "the metered Firecrawl". Since PR #56 the self-hosted deployment is
  preferred, so the fallback is only metered when self-hosted is unconfigured.
  Reword to match `firecrawl-endpoint.ts`.
- **`N8N_API_KEY`** appears only in `connectors/connections.server.test.ts:38,57,63`
  as fixture data. It is not a real env name in this product. Rename the fixture
  to a name the catalog actually uses, or to an obviously fake one, so nobody
  greps it and concludes n8n wants an API key.
- **`docs/context/CURRENT_BUILD.md`** is stale at `2a2e87f` / 1168 tests. It now
  carries a warning banner pointing at the newer documents, but the real fix is a
  refresh of its section 0.
- **Three server functions with no caller** — `title-h1-proposals.functions.ts ::
  generateTitleH1Proposal`, `change-requests.functions.ts ::
  markChangeRequestApplied`, `seo-runs/functions.ts :: createSeoRun`. A
  `createServerFn` export with no UI caller is a browser-reachable endpoint
  nothing invokes. Confirm each is genuinely unreferenced (the scan was grep, not
  type-aware) and then either wire or delete. `markChangeRequestApplied` is the
  one to check first, because it sounds like it belongs to the approval path.

---

# Part 2 — What the Firecrawl argument was actually about

Reconstructed from `git log` and `docs/context/DECISION-LOG.md`, not from
memory. It is one story in four beats.

### Beat 1 — every scrape was billed, for months

AOOS's page audit renders pages to check their live wording. Four separate files
each hardcoded `https://api.firecrawl.dev` and read `FIRECRAWL_API_KEY`
directly. So **every page of every audit went to the metered cloud Firecrawl
API** — at up to 100 pages per audit.

Meanwhile Max was running two scrapers on his own hardware: **Crawl4AI** at
`crawl.marky.systems` (the connector key `vps_scraper`) and a **self-hosted
Firecrawl** at `fire.marky.systems` (the key `selfhosted_firecrawl`).

### Beat 2 — the app already knew, and said so in writing

Both self-hosted boxes were declared in the connector catalog, given health
probes, and surfaced in the tool registry. They were read by **nothing that
scrapes**. `scrapeWithVps` — the Crawl4AI client — was already written, already
restricted to the governed TruMove origin (exactly what the audit crawls), and
its only callers were its own tests.

`surface-inventory.ts` had recorded the gap in plain language: *"no audit path
uses it, so the paid Firecrawl account absorbs all crawl cost."* Documented, and
never closed.

### Beat 3 — why nobody looked: a comment that was false

A comment in `command-center.ts` asserted **"Firecrawl is self-hosted here, so
this is not a per-call vendor charge."** It was wrong, and it sat three files
away from the code that disproved it. Anyone checking whether audits cost money
read the comment, believed it, and stopped.

That is the whole mechanism, and it is why the standing rule now says: *verify
against the code that makes the call, never against the comment.*

### Beat 4 — the two fixes, both on 2026-08-22

- **PR #55 `dd5ba19`** — the page audit now renders on Crawl4AI first, and the
  false comment was corrected rather than left to mislead the next reader.
- **PR #56 `1900f1a`** — `firecrawlEndpoint()` became the single chooser:
  self-hosted whenever it has both a base URL and a key, cloud only as fallback,
  and it reports which one answered so a caller can say so *"rather than leaving
  the operator to find out from a bill."* Verified against the box that both
  deployments speak the same v2 API and return the same
  `{ success, data: { rawHtml, markdown } }` shape, so no adapter was needed —
  the callers only had to stop hardcoding.

Later, **#63** gave the self-hosted Firecrawl box a real probe and **#64**
surfaced the HTTP status the probe had always recorded.

### The separate thing that made it feel unresolved

On 2026-08-24 the ledger kept reporting `FIRECRAWL_API_KEY` as `configured` even
though Max had deleted the connector. He was right; the dashboard was not stale.
The variable that connector injected **survived inside the running deployment's
environment**, and `state` reads that deployment's live `process.env`. There was
nothing left to delete — only a redeploy could clear it. The same applied to
`GOOGLE_SEARCH_CONSOLE_API_KEY` and `PERPLEXITY_API_KEY`.

### What is still open today

The wiring is done and centralised — six call sites, all through
`firecrawlEndpoint()`, and cloud Firecrawl now appears only in its own
credit-usage probe. **But no stored evidence records a scrape that actually
executed against `fire.marky.systems`.** `runPageAudit` prefers Crawl4AI and has
never been observed failing over, so the self-hosted Firecrawl path is correct in
code and unexercised in practice. That is a runtime-evidence gap, not a wiring
gap, and the cheapest way to close it is to run one audit with Crawl4AI
deliberately unconfigured and check the `rendered_by` value on the resulting
observations.

---

# Part 3 — Exposed but not used

Four layers. Each answers "we can reach this, and nothing does".

## 3.1 Provider capabilities AOOS does not call

| Provider | Exposed, unused | Evidence |
| --- | --- | --- |
| **Google Ads** | Everything except `customers:listAccessibleCustomers` — all reporting, campaign, spend and budget operations | `google-ads.server.ts:73` is the only endpoint in the repo |
| **GA4 Admin API** | The entire surface. A digest exists at `docs/integrations/ga4-admin-api/DIGEST.md`; no client was ever written | no file imports it |
| **GA4 Measurement Protocol** | Same — digest, no client | `docs/integrations/ga4-measurement-protocol/DIGEST.md` |
| **GA4 Data API** | `batchRunReports`, comparisons, the newer `EmptyFilter` — AOOS uses only `runReport` | `ga4.server.ts:15` |
| **SearXNG** | The whole service | zero consumers, see item 3 above |
| **Firecrawl (self-hosted)** | `/v2/scrape` is wired but has never been observed executing | see Part 2 |

## 3.2 The capability registry's own honesty field

`src/registry/types.ts:10` defines `integrationState: "real" | "simulated" |
"pending" | "mock"` with the comment *"never claim more than is wired."* Across
the 11 registry modules:

- **25 capabilities `real`**
- **5 capabilities `pending`** — and four of the five are the SerpApi ads family:
  `ads.transparency` (Google Ads Transparency), `ads.advertiser_resolution`,
  `ads.creative_intelligence`, `ads.live_serp_observation`, plus Umami
  (`self-hosted-analytics.ts:18`).
- **0 `simulated`, 0 `mock`** — consistent with finding 7 of the audit.

That `pending` cluster correlates exactly with the unreferenced exports found in
the codebase map: `serpapi/creatives.server.ts :: rebuildCreativeFamilies`,
`serpapi/advertisers.server.ts :: ADVERTISER_MODULE`, `serpapi/sweep.server.ts ::
SWEEP_MAX_DOMAINS`. **The SerpApi ads intelligence module is built and not
connected.** That is the largest single block of finished-but-unreachable work in
the repo, and it deserves its own decision: finish the wiring, or archive it.

The 18 declared capability operations are inventoried at
[`../integrations/_audit/registry-operations.txt`](../integrations/_audit/registry-operations.txt);
5 are marked `mutates: true`.

## 3.3 AOOS's own MCP server

Eight tools, all `readOnlyHint: true`, listed in `src/lib/mcp/index.ts`. They are
**not consumed by AOOS's own UI** — that is by design; they exist for external
MCP clients (Claude, and anything else Max points at `/mcp`). So "unused" here
means something different: the surface is available and its usage is *measurable*
but was not measured in this audit.

It is measurable because `guard.ts:43` files every call to `activity_events` with
`actor_kind: "mcp_client"`. **A single query against that table would show which
of the eight tools have ever actually been called.** Worth running — if some have
never been invoked, that is real evidence about which parts of the OS an outside
agent finds useful.

`call_openseo_free_read` is the one to watch: it is the only tool with
`openWorldHint: true`, and it proxies to another MCP server.

## 3.4 OpenSEO's tools, filtered by policy

AOOS deliberately exposes only a **subset** of OpenSEO's toolset.
`classifyOpenSeoTool` (`src/lib/openseo/catalog.ts:14`) sorts every discovered
tool into four modes by reading its live annotations and description:

| Mode | Condition | Reachable through AOOS MCP? |
| --- | --- | --- |
| `destructive` | `destructiveHint: true` | **No** |
| `mutation` | not `readOnlyHint` | **No** |
| `metered_read` | read-only, description implies credits | **No** — requires confirmation |
| `free_read` | read-only and description explicitly says free | **Yes** |

Everything that is not `free_read` is exposed by OpenSEO and refused by AOOS —
deliberately, and correctly. Note the cost detection is *regex over the tool
description* (`EXPLICIT_FREE` / `EXPLICIT_METERED`, lines 3-5), so a tool whose
description does not mention cost classifies as `unknown` → `metered_read` →
blocked. **That fails safe**, but it also means a genuinely free OpenSEO tool with
a badly worded description is silently unavailable. If a tool that should work
does not, check its description wording before checking anything else.

The live list could not be enumerated here — `seo.marky.systems/api/health`
returns 401 without the Caddy basic-auth password. Running `list_openseo_tools`
against the deployed app would produce the actual inventory with each tool's
classification attached.

## 3.5 MCP servers connected to Claude Code, unused by this project

Eleven servers are connected to this session, exposing roughly **235 tools**.
Relevance to AOOS varies enormously.

| Server | ~Tools | Used for AOOS? |
| --- | --- | --- |
| Lovable | 40 | **Yes** — deploys, project DB, connectors. The primary route to AOOS's Postgres. |
| serena | 29 | **Yes** — code intelligence, this audit. |
| context7 | 2 | Yes, for provider docs. |
| Supabase | 29 | **No** — authenticated to a different account; AOOS's ref `zrfzllupoccmztyweznq` is not among its 12 projects. |
| **Vercel** | 37 | **No.** Verified: 43 Vercel projects on team `maxs-projects-6b4bb981`, and **none is AOOS** — AOOS deploys through Lovable. |
| Gmail | 28 | No. |
| Google Drive | 11 | No. |
| 21st | 35 | No. |
| claude-in-chrome | 22 | Only incidentally. |
| openrouter | 1 | Second opinions only. |
| sequential-thinking | 1 | Occasional. |

**The finding worth acting on:** the Vercel server exposes five spending tools —
`buy_domain`, `buy_pro`, `buy_credits`, `buy_addon`, `get_purchase_quote` — plus
`deploy_to_vercel`, `pause_project` and `update_project_deployment_protection`,
across 43 projects that include live sites. None of it is used for AOOS. Gmail
similarly exposes `send_message`, `forward`, `trash_thread` and spam controls;
Drive exposes `share_file` and `trash_file`.

That is a standing write-and-spend surface attached to every session, for work
that does not need it. Two reasonable responses:

- **Disconnect the servers this project does not need**, and reconnect them in
  sessions that do. Note from `~/.claude/rules/context.md`: connecting or
  disconnecting an MCP server whose tools are *loaded* invalidates the prompt
  cache mid-session — but these are deferred (names only), so the cost of having
  them connected is small and the cost of toggling is the cache. Do it at a
  session boundary.
- **Or add deny rules** in `settings.json` for the purchase tools specifically.
  That is enforcement rather than prose, which is the house preference — a rule
  that must hold every time belongs in a permission, not a sentence.

Either way this is Max's call, not mine to make: I will not grant or revoke a
permission on my own.

---

## Suggested order of work

1. **Together, one PR:** items 1 (GA4 probe), 2 (`.env` — done, in its corrected
   form), 3 (SearXNG), and the small corrections in item 7. All mechanical, all
   verifiable, no decisions required. Item 3b is withdrawn: the fix was already
   in place.
2. **Ask Max:** Google Ads (item 4), the Gemini bypass (item 5), and the
   MCP write-surface question in §3.5.
3. **Then:** the OpenAI Ads connector row (item 6), the `activity_events` query
   in §3.3, and a decision on the pending SerpApi ads module in §3.2.
4. **Cheap and satisfying:** run one page audit with Crawl4AI unconfigured to
   close the last open Firecrawl question in Part 2.
