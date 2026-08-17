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

## The taxonomy

Four groups, one meaning each:

```text
System health   something the OS could not do, or a connection that is not proven
Decisions       a human must say yes or no before anything changes
Evidence        stored facts, read-only, nothing to decide
Run work        automations, schedules, and manual tools that produce evidence or changes
```

Every workspace, every page header, and every Action Center lane uses exactly one of these.

## Assignment per page

- **System health**: Capabilities, Tool estate, Data costs, People, plus the failure strip on the Action Center.
- **Decisions**: Action center, Page changes, Keywords, Competitors, Observations.
- **Evidence**: Overview, Search results, Site health, Competitor ads, Trust gaps, Marketing essentials, Assets, Knowledge.
- **Run work**: Workflows, Schedule, SEO runs, SEO tools (OpenSEO), OpenAI Ads, Agents.

Changes from today: Agents moves from System to Run work (it does work). Knowledge moves from System to Evidence (it is stored fact). Capabilities and Tool estate group under System health rather than a generic "System".

## Fixes bundled in, because the taxonomy exposes them

1. **Keywords page**: default to showing all candidates with state filter chips (Pending / Approved / Rejected / All) and counts, so 40 approved keywords are visible. Pending stays the default tab only when a pending count exists.
2. **Competitors page**: same treatment, 71 candidates versus 6 tracked should both be reachable.
3. **Empty states**: any page whose backing table is genuinely at zero (Trust gaps, GA4, PageSpeed, ad creatives, OpenSEO runs) says why it is empty and what would fill it, rather than looking broken.
4. **OpenSEO** renamed to "SEO tools" with the hint "manual, one-off tool calls" so it stops reading as a rival to SEO runs.

## Technical notes

- New module `src/lib/os-taxonomy.ts` exports the four group keys, their labels and one-line definitions, and a `WORKSPACE_GROUP` map from route path to group. Single source of truth.
- `src/components/os/shell.tsx` builds `navGroups` from that map instead of its own inline list.
- `src/components/os/primitives.tsx` gains a `group` prop on `PageHeader` that renders the group name as the eyebrow with its definition as hover text; each route passes `group` instead of a hand-written eyebrow string.
- `src/lib/action-center.ts` lane labels align to the same words (System health, Decisions, Run work).
- Keywords and Competitors: extend the existing list server functions to accept `"all"` (Keywords already supports it) and add client-side filter chips; no schema change, no new tables, no migration.
- Tests updated: `src/lib/action-center.test.ts`, plus a new unit test asserting every route in the sidebar has exactly one taxonomy group.
