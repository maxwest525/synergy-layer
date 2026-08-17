# Shared grouping taxonomy across every page

## First: answers to your questions (checked against the live database)

**Nothing is missing. Earlier work is all there.**

| What | Stored right now |
| --- | --- |
| Keyword candidates | 40 — all in state `approved` |
| Tracked keywords | 40 |
| Competitor candidates | 71, tracked competitors 6 |
| Search Console snapshots | 103 |
| Inbox items | 61 |
| Recommendations | 11 |
| Change requests | 2 |
| Workflows / runs / schedules | 17 / 56 / 8 |
| Knowledge entries | 21, assets 8, capabilities 28 |
| SEO runs | 3 |
| OpenSEO tool runs | 0 |
| Authority findings, GA4, PageSpeed, ad creatives | 0 |

**"Why do I have no keyword candidates?"** The Keywords page only ever asks for candidates with review state `pending`, and every one of the 40 has already been approved. So the page truthfully has nothing pending and renders an empty state, while 40 approved keywords sit one filter away, invisible. That is a presentation bug, not missing data.

**"Why do I have SEO runs and OpenSEO?"** They are two different things that were named alike:
- **SEO runs** = the governed change pipeline (evidence to proposal to approval to execution to verification). 3 exist.
- **OpenSEO** = a manual tool runner for one-off SEO tool calls. 0 runs ever.

They should not be two peers in the sidebar. OpenSEO becomes a tool surface under Run work with a clear "manual tools" label, and SEO runs keeps the governed-pipeline name.

**"Shouldn't the workflow be categorized by type?"** Yes, and that is what this plan does: one taxonomy, four groups, applied identically in the sidebar, in page eyebrows, and in the Action Center lanes, with nothing uncategorized.

## The taxonomy, ordered the way a day actually runs

You are right that System health is not a day-to-day starting point. It is configuration and plumbing, so it goes last. The order is the loop itself:

```text
1 Decisions      something is waiting on your yes or no          <- you start here
2 Evidence       the stored facts behind those decisions
3 Run work       the automations and tools that produce more of both
4 System health  connections, costs, access. Only when something breaks
```

## The loop, per type

Each group is one stage of a single repeating cycle, not four unrelated buckets:

```text
        Run work  ──produces──>  Evidence  ──raises──>  Decisions
            ^                                                │
            └──────────── approved work re-runs ─────────────┘

        System health sits underneath: it is only consulted when a
        stage above cannot complete (a provider fails, a cost ceiling
        is hit, an operator lacks access).
```

Written out per type:

- **Decisions loop**: a proposal appears (page change, keyword, competitor, observation) to you approving or rejecting it, to the approved item entering Run work, to Evidence proving it landed. Every decision page ends with "what happens after you say yes."
- **Evidence loop**: a workflow or schedule collects a snapshot, to the snapshot being stored immutably, to a rule reading it, to a new proposal in Decisions. Every evidence page says which run produced it and when the next one is due.
- **Run work loop**: a workflow runs, either on schedule or because you approved something, to a run record, to either new evidence or an executed change. Every run page links back to the decision that authorized it.
- **System health loop**: a stage fails, to a failure item, to a fix on the connection, cost, or access, to the failed stage retried. Failures surface as a strip on the Action Center so you do not have to go looking, but the workspace itself sits last in the sidebar.

## Assignment per page

- **Decisions**: Action center, Page changes, Keywords, Competitors, Observations.
- **Evidence**: Overview, Search results, Site health, Competitor ads, Trust gaps, Marketing essentials, Assets, Knowledge.
- **Run work**: Workflows, Schedule, SEO runs, SEO tools (OpenSEO), OpenAI Ads, Agents.
- **System health**: Capabilities, Tool estate, Data costs, People.

Changes from today: Decide becomes Decisions and stays first. Agents moves from System to Run work (it does work). Knowledge moves from System to Evidence (it is stored fact). The old "System" group becomes System health and drops to the bottom.


## Fixes bundled in, because the taxonomy exposes them

1. **Keywords page**: default to showing all candidates with state filter chips (Pending / Approved / Rejected / All) and counts, so 40 approved keywords are visible. Pending stays the default tab only when a pending count exists.
2. **Competitors page**: same treatment, 71 candidates versus 6 tracked should both be reachable.
3. **Empty states**: any page whose backing table is genuinely at zero (Trust gaps, GA4, PageSpeed, ad creatives, OpenSEO runs) says why it is empty and what would fill it, rather than looking broken.
4. **OpenSEO** renamed to "SEO tools" with the hint "manual, one-off tool calls" so it stops reading as a rival to SEO runs.

## Technical notes

- New module `src/lib/os-taxonomy.ts` exports the four group keys in loop order (decisions, evidence, run_work, system_health), their labels, one-line definitions, and a `WORKSPACE_GROUP` map from route path to group. Single source of truth for order and naming.
- `src/components/os/shell.tsx` builds `navGroups` from that map instead of its own inline list, rendering in loop order with System health last.
- `src/components/os/primitives.tsx` gains a `group` prop on `PageHeader` that renders the group name as the eyebrow with its definition as hover text, plus a one-line "next stage" pointer so each page states where the loop continues; each route passes `group` instead of a hand-written eyebrow string.
- `src/lib/action-center.ts` lane labels align to the same words, decision lanes first and the failure strip labeled System health beneath them.
- Keywords and Competitors: extend the existing list server functions to accept `"all"` (Keywords already supports it) and add client-side filter chips; no schema change, no new tables, no migration.
- Tests updated: `src/lib/action-center.test.ts`, plus a new unit test asserting every route in the sidebar has exactly one taxonomy group.

## Where the uploaded SEO framework lands

The 14-phase framework is a checklist of SEO work. AOOS is the loop that governs work. So the framework does not become a new workspace. Each phase is a **concern** with an owner in the existing loop: something that produces evidence, something that raises a decision, and something that executes it.

Mapping, with honest coverage:

```text
Phase                                   Lands in            AOOS coverage today
1  Strategic planning & intelligence    Evidence/Decisions  partial (keywords, competitors, SERP)
2  Server & infrastructure              Evidence            none (no server/protocol probe)
3  Indexation & crawl budget            Evidence/Decisions  partial (GSC coverage only, no log files)
4  Semantic engineering & schema        Decisions           none (no schema audit, executor could ship it)
5  On-page & internal links             Decisions           partial (title/H1 change requests only)
6  E-E-A-T & trust                      Evidence            partial (trust gaps table, mostly empty)
7  Digital PR & off-page equity         Evidence/Decisions  partial (backlink baseline, no outreach)
8  UX & Core Web Vitals                 Evidence            partial (PageSpeed wired, zero snapshots)
9  Legal, trust, accessibility          Evidence            partial (Marketing essentials concerns)
10 Generative engine optimization       Evidence/Decisions  none
11 Omni-channel surfaces                Evidence            none
12 Localized search ecosystems          Evidence/Decisions  none (GBP not connected)
13 Enterprise analytics & change ctrl   Run work/System     strong (GSC pipeline, GitHub executor, receipts)
14 Monetization & funnel alignment      Decisions           blocked (no revenue access, by operator decision)
```

### How it gets optimized: a living concern set, not a checklist

The framework becomes the seed of a **dynamic** Marketing essentials, not a hardcoded list of 51 rows.

Data model (new tables, tenant scoped, RLS plus GRANTs in the same migration):

- `essential_concerns`: phase, task, description, evidence source, current status, last evaluated at, origin (`framework_seed`, `agent_proposed`, `operator_added`). Rows can be added, retired, or reprioritised at runtime.
- `essential_concern_evaluations`: immutable history. Every status change stores the evidence it was derived from, the run that produced it, and any limitation. Status is never typed in by hand.

Status is always derived, never authored:

- **Proven** only after a real stored snapshot supports it.
- **Failing** when stored evidence contradicts it.
- **Not measured** when the evidence source exists but has no snapshot yet.
- **No way to check this yet** when no capability can measure it, naming the capability that would. That is the honest state for phases 2, 10, 11, 12 today.

A failing concern with a supported change type raises a proposal into Decisions and rides the existing approval plus GitHub execution path. Nothing mutates the site without approval.

### The reasoning agent on Marketing essentials

Essentials gets a side-by-side agent panel, not a static table alone.

- Server-side agent using the AI SDK through the Lovable AI Gateway, on a high-reasoning model. Streaming responses.
- Read tools only in v1: read concerns and their evaluation history, read GSC snapshots, keywords, competitors, PageSpeed, backlinks, change requests, tool estate readiness.
- Write tools are proposal-only and each requires approval: propose a new concern, retire a concern, reprioritise, or draft a change request. The agent can never set a status or execute a change.
- Every agent claim cites the stored evidence row it came from. Uncited claims are labelled as reasoning, not fact.
- The panel is contextual: selecting a concern scopes the conversation to it, with its evidence and history preloaded.

This is the slice that makes essentials dynamic: the concern set grows and shrinks through agent proposals plus your approvals, and the framework CSV is just the starting seed.

### Your exploration page

A new top-level route, **Studio** (working name), placed under Decisions in the sidebar.

- v1 is deliberately blank: an empty conversation surface with the composer, streaming, markdown, and collapsed tool-call accordions.
- No tools wired yet, no persistence yet. It exists so the shell, streaming transport, and agent identity are proven before the essentials agent leans on the same components.
- Private to you: scoped to your operator identity, not shared tenant-wide.

## Sequencing

1. Taxonomy pass (the earlier sections of this plan). Nothing else depends on the agent work.
2. Studio: blank agent page with streaming transport. Establishes the shared chat components.
3. Dynamic concern tables plus migration, seeded from the framework CSV, with derived statuses.
4. Essentials agent panel reusing the Studio components, read tools first, proposal tools second.

