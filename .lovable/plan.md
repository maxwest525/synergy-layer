# AOOS front to back: an agent that does the work, on six screens

You picked all four. They are one problem: AOOS was built as 23 hand-made screens over a governance model, so the machinery grew faster than the work. This plan changes the operating model, not the paint.

## What is actually true today (checked against the live database)

| Fact | Number |
| --- | --- |
| Routes / route files | 23 workspaces, 54 route files, ~10k lines |
| Change requests | 2, of which 1 reached applied or verified |
| Execution receipts | 11 |
| Measurement cycles opened | 1 |
| Search Console snapshots | 103, healthy daily |
| GA4 / PageSpeed / ad creatives / trust gaps | 0, 0, 0, 0 |
| Workflow runs | 29 succeeded, 13 failed |
| Provider connections | 18 recorded: healthy DataForSEO, Firecrawl, SerpAPI, GitHub, Supabase. Degraded Search Console. Pending GA4, PageSpeed, Gemini |

So the loop has completed roughly once, on one page, and never produced a measured outcome. Everything else is surface.

## The four fixes, in one operating model

### 1 The agent is the product, not a page

Today the agent is a panel you can visit. It becomes the way you use AOOS.

- Every screen has one composer. You type what you want in plain words. The agent reads stored evidence with tools, reasons out loud, and comes back with either an answer or a proposal.
- The agent runs on a high-reasoning model through the AI gateway, with a tool catalog over the data that already exists: Search Console snapshots, keywords, competitors, backlinks, change requests, executions, measurement cycles, tool estate readiness, spend.
- Read tools run freely. Every write is proposal-only and lands in Decisions for your yes or no. The agent can never edit the site, set a status, or spend money without approval.
- Each claim cites the stored row it came from. Uncited statements are labelled reasoning, not fact.

### 2 Prove the loop end to end, once, on purpose

Before anything new gets built, one change goes the whole distance and the system reports the result in plain words:

evidence to proposal to your approval to GitHub execution to publish verification to a measurement window to a stated outcome.

That means picking a page with real Search Console loss, letting the agent draft the change, approving it, executing it, opening the measurement cycle, and holding it open until the window closes. The Action Center then shows one sentence: what changed, when, and whether impressions and clicks moved. If they did not move, it says that too.

### 3 Six screens, not twenty-three

The 23 workspaces collapse into six, in the loop order that already exists. Nothing is deleted; the retired surfaces become sections or agent tools underneath these six.

```text
1 Today        what needs your yes or no, plus what changed since yesterday
2 Ask          the agent surface, full width, with the whole tool catalog
3 Evidence     one browser over every stored fact, filtered by source
4 Work         runs, schedules, executions, receipts
5 Coverage     the marketing framework as live concerns with derived status
6 Setup        connections, costs, access. Only when something breaks
```

Old routes redirect. Keywords, Competitors and Observations become lanes inside Today. Search results, Site health, Competitor ads, Trust gaps, Assets and Knowledge become filtered views of Evidence. Workflows, Schedule, SEO runs, SEO tools, OpenAI Ads and Agents become sections of Work. Capabilities, Tool estate, Data costs and People become Setup.

### 4 Real, unproven, and impossible are labelled everywhere

One shared status vocabulary, derived from stored evidence, never typed:

- **Working** — a real authenticated read stored a snapshot recently.
- **Set up, never proven** — credentials exist, no successful read yet. GA4 and PageSpeed today.
- **Broken** — a real failure with the reason and the last attempt. Search Console is degraded and says why.
- **Cannot measure yet** — no capability exists, naming what would be needed. Generative search, omni-channel, localized search today.

Empty screens stop looking broken: each says which of the four it is and what run would fill it. Anything in the second or fourth state is visibly quarantined rather than mixed in with real numbers.

## Coverage: the framework becomes live, not a checklist

The 55 tasks from your framework CSV seed two tenant-scoped tables: `essential_concerns` (phase, task, plain description, evidence source, priority, origin, retired at) and `essential_concern_evaluations` (insert-only history, each row storing the evidence it was derived from and its limitation).

Status derives from the same four-word vocabulary above. A failing concern with a supported change type lets the agent draft a proposal into Decisions. Concerns can be added, retired, and reprioritised at runtime through agent proposals plus your approval, so the set grows with the business instead of being frozen in code.

## Order of work

1. **Prove the loop.** One real change, executed, verified, measured, reported. No new screens.
2. **Agent core.** Shared chat components extracted from Studio, tool catalog over existing evidence, citations, proposal-only writes, tool calls shown as collapsed accordions.
3. **Six screens.** Consolidate routes with redirects, one status vocabulary, honest empty states.
4. **Coverage.** Concern tables, framework seed, derived evaluations, agent proposals against them.
5. **Fix or retire the unproven.** GA4 and PageSpeed either get proven with a real stored snapshot or are marked cannot-measure with the reason, rather than sitting silently at zero.

Each step ends with something you can look at. Step 1 is the one that answers "it has never done the work."

## Technical notes

- Agent tools live in `src/lib/ai/tools/*.server.ts`, one file per domain, each tenant-scoped and executed as the operator through the existing auth middleware. Streaming routes under `src/routes/api/` mirror the Studio route including bearer verification.
- Tool results are compact and serializable and always carry the row ids they came from so the transcript can cite them.
- Route consolidation keeps every existing server function; only the presentation layer merges. Old paths get permanent redirects so nothing published breaks.
- One migration for the concern tables: GRANTs, RLS, tenant-member policies, insert-only trigger on evaluations, and literal seed rows for the 55 framework tasks.
- `src/lib/os-status.ts` becomes the single source of the four-state vocabulary, used by Setup, Coverage, Evidence and the Action Center alike.
- Tests: status derivation for all four states, proposal-only guard on every write tool, and a route map test asserting every retired path redirects.

## Not in this pass

- No new provider integrations, so anything that needs one stays honestly unmeasurable.
- No revenue, conversion, or funnel scoring, per your standing decision.
- No autonomous execution. Every mutation still waits on your approval.
