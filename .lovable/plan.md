# Finish the approved plan: dynamic Marketing essentials plus the agent

You are right. The approved plan had four sequenced steps and only the first two shipped.

## Where the approved plan actually stands

| Step | Status |
| --- | --- |
| 1 Taxonomy pass (nav, page headers, Keywords and Competitors filters, SEO tools rename) | Done |
| 2 Studio: blank agent surface with streaming | Done |
| 3 Dynamic concern tables seeded from the framework, derived statuses | Not started |
| 4 Essentials agent panel with read tools then proposal tools | Not started |

Steps 3 and 4 are the substance. This plan does both in one pass, plus the two taxonomy leftovers.

## Step 3: Marketing essentials becomes a live concern set

Today Essentials derives 18 hardcoded concerns in application code. That is replaced by data.

**Two new tenant-scoped tables** (one migration, GRANTs plus RLS plus policies in the same migration):

- `essential_concerns` — phase, task, plain-language description, evidence source, current status, priority, last evaluated at, origin (`framework_seed`, `agent_proposed`, `operator_added`), retired at. Rows are added, retired, and reprioritised at runtime.
- `essential_concern_evaluations` — immutable history. Every status change stores the evidence rows it was derived from, the run that produced it, the limitation, and the timestamp. Insert-only, mutation refused by trigger, matching the existing evidence tables.

**Seed** — the 55 tasks across 14 phases from the uploaded framework CSV, written as literal INSERT statements in the migration so the screen has real rows the moment it loads. Each row carries its evidence source and whether any current capability can measure it.

**Status is derived, never typed.** An evaluator server function reads stored snapshots and writes one evaluation row per concern:

- Proven — a real stored snapshot supports it.
- Failing — stored evidence contradicts it.
- Not measured — the evidence source exists but has no snapshot yet.
- No way to check this yet — no capability can measure it, naming the capability that would. That is the honest state for server architecture, generative engine optimization, omni-channel, and localized search today.

**The screen** — Essentials lists concerns grouped by phase with status counts, a filter for each status, and per-concern evidence and history. A failing concern with a supported change type gets a "propose a fix" action that raises a change request into Decisions and rides the existing approval and GitHub execution path. Nothing mutates the site without approval.

## Step 4: the reasoning agent on Essentials

A side-by-side panel reusing the Studio chat components, on the same high-reasoning model through the Lovable AI Gateway.

- **Read tools** — read concerns and their evaluation history, Search Console snapshots, keywords, competitors, PageSpeed, backlinks, change requests, tool estate readiness. Every tool is tenant-scoped and runs as the operator.
- **Proposal-only write tools**, each requiring your approval before it lands: propose a new concern, retire a concern, reprioritise, or draft a change request. The agent can never set a status or execute anything.
- Every claim cites the stored row it came from. Anything uncited is labelled reasoning, not fact.
- Selecting a concern scopes the conversation to it with its evidence and history preloaded.

Tool calls render as collapsed accordions in the transcript so you can see exactly what it read.

## Taxonomy leftovers folded in

1. **Honest empty states** on every page whose table is genuinely at zero (Trust gaps, GA4, PageSpeed, competitor ads, SEO tools runs): say why it is empty and what run would fill it, instead of looking broken.
2. **Action center lane wording** aligned to the taxonomy words, decision lanes first and the failure strip labelled System health beneath them.

## Technical notes

- Migration creates both tables with `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`, `GRANT ALL ... TO service_role`, RLS on, tenant-member policies, an insert-only trigger on the evaluations table, and the 55 seed rows.
- `src/lib/essentials.functions.ts` gains list, evaluate, and proposal server functions under `requireSupabaseAuth`; derivation logic moves into `src/lib/essentials/evaluate.server.ts` so the functions file stays a thin wrapper.
- The evaluator is registered as a workflow step so it re-runs on schedule, not only on page load.
- Agent tools live in `src/lib/ai/essentials-tools.server.ts`; the streaming route is `src/routes/api/essentials-chat.ts`, mirroring the Studio route including bearer verification.
- Studio's transcript, composer, and streaming pieces are extracted into `src/components/os/agent-chat.tsx` and shared by both surfaces.
- Unit tests cover status derivation for each of the four states and the proposal-only guard on every write tool.

## Not in this pass

- No new provider integrations, so concerns that need one stay honestly unmeasurable.
- No conversation persistence in Studio yet.
- No revenue or funnel scoring, per your standing decision.
