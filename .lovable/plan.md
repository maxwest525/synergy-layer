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

### How it gets optimized, concretely

Each framework task becomes a row in the existing **Marketing essentials** concern model, not a new page. A concern already carries a status derived from real evidence, so the framework slots straight in:

- Add a `phase` and `task` field to the essentials concern definitions and seed all 51 framework tasks as concerns.
- Every concern declares which evidence source proves it (GSC, PageSpeed, DataForSEO, Firecrawl crawl, manual attestation) and stays **Not measured** until that source stores a real snapshot. No task shows green because it was typed in.
- Concerns whose evidence source does not exist yet display **No way to check this yet** with the capability that would enable it. That is the honest answer for phases 2, 10, 11, 12.
- When a measured concern fails and a supported change type exists (title/H1, schema block, internal link), it raises a proposal into Decisions and rides the existing approval and GitHub execution path.
- Marketing essentials becomes the coverage map for the whole framework: 51 tasks, each either proven, failing, or explicitly unmeasurable.

This is scoped as a follow-up slice after the taxonomy pass, not bundled into it.
