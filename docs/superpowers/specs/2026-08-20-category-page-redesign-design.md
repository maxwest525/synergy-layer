# Category-page redesign — design spec

Date: 2026-08-20. Approved by Max against the visual boards at
https://claude.ai/code/artifact/0e2e7892-ab77-47e9-8a51-eb1337110859 (version label
`truenroll-match`). Research digest: `docs/superpowers/research/2026-08-20-category-page-ux-research.md`.
The boards are the authority on look and feel; this document is the authority on behavior and scope.

## Problem

The app has ~30 routes under 6 abstract nav groups. The operator (one non-expert user) cannot find
anything and does not know what to do next. Detection works (rules, findings, proposals) but the UI
buries it.

## Decision

Replace the current navigation with **7 self-contained category pages** plus a Command center home.
Old routes are removed from the nav as each category page absorbs them (route files may remain
temporarily but must not be linked). The nav cap is permanent: new features go INSIDE a category,
never as new nav items.

Categories (plain-words names are the real page titles):

| # | Page | Absorbs today's routes | Data behind it |
|---|------|------------------------|----------------|
| 0 | Command center (home, `/`) | Today, Activity (summary) | all categories' queues + metrics |
| 1 | Getting found on Google | /search, /keywords (findings part) | GSC snapshots, rules, inspections |
| 2 | Who visits your site | /ga4, /measurement (traffic part) | GA4 snapshots + ga4 rules |
| 3 | Your pages | /pages, /changes, /authority | page audit, proposals, change requests |
| 4 | Your competition | /competitors, /ads, /keywords (rank part) | SERP validation, vendor ads |
| 5 | Site health | /measurement (speed), site checks | pagespeed, site audit |
| 6 | Connections (setup) | /capabilities, /gaps, /scheduler, /spend | capabilities, schedules |

Deliberately NOT in the nav: /studio, /notes, /roadmap, /agents, /workflows, /operators,
/openseo, /openai-ads, /seo-runs, /knowledge, /essentials, /assets, /recommendations,
/command-center (old evidence page). They stay reachable by URL and, where still useful, get a
link from the relevant category page ("History of fixes" → /seo-runs etc.). Nothing is deleted
in this phase.

## The shell (both boards show it)

- Top bar: logo, breadcrumb (`trumoveinc.com › Categories › <page>`), centered "Search or ask
  Marky ⌘K" input, right-side status ("All systems normal") or "Ask about this page" button.
- Far-left icon rail (52px): Command center, the 6 categories, settings. Active item boxed green.
- Secondary nav panel (208px): within a category — Overview / Suggestions / detail views;
  below, quick links to other categories with waiting-counts colored by urgency.
- Palette: pure black `#000`; cards `#0a0a0a` border `#262626`; inner cards `#060606`; text white,
  explanations `#a3a3a3`/`#8a8f98`; green `#1fd15f` (good / assist / approve / active), yellow
  `#eab308` (needs attention / waiting), red `#ef4444` (urgent / losing / waited long), blue
  `#38bdf8` (nice to have). No pills (dot + caps text instead), no filled buttons (outlined dark
  buttons; Approve differs only by green text + green border). Icons are stroke SVG (lucide is
  already in the repo) on every tab, nav item, tile, and card title.

## Category page template (board: "Category page")

Identical skeleton on every category page, top to bottom:

1. **Plain-words header**: title, one sentence saying what the page is for, one status line
   (dot + verdict written as consequence: "Mostly OK — clicks dipped, 2 things worth fixing").
2. **Tab strip with icons**: Overview · Suggestions (count) · 2-3 detail tabs · History (count).
   Active tab green with underline. Tabs are views within the page, not routes.
3. **Metric tiles** (3-5, never more): caps label with icon, big white number, delta colored by
   direction, one gray line explaining it in plain words with the technical term in quotes
   ("Google calls this CTR") and a "see why" link when flagged.
4. **Suggestion queue** (the page's center of gravity):
   - Eyebrow: "This week's suggestions · Nothing changes without your approval".
   - Progress: "4 of 7 handled this week" (moves on approve AND ignore/delete).
   - Tabs: Open / Ignored (restorable) / Done (permanent receipts).
   - Capped at 7 visible per week, ranked Fix now (red) / Worth doing (yellow) / Nice to have
     (blue). Urgency written as time where possible ("losing clicks 2 weeks").
   - Card anatomy (expanded): icon + claim in plain words (one decision per card), evidence line
     from real data, Now → After-approving comparison, three fixed explainer lines (What this is /
     Why it matters / What approving does), verb footer.
   - Verbs, fixed order, always visible: **Approve** (green outline) · **Regenerate** · **Ignore**
     · `···` menu (Delete lives here). Approve hands off to the EXISTING change-request flow
     (`change_requests`, `/changes/$id` review, governed GitHub commit, proof, measurement) — the
     card is a front door, never a bypass. Regenerate re-drafts in place (1 Firecrawl + 1 Gemini,
     operator-click only). Ignore suppresses the finding type and files the card under Ignored.
   - Receipt rows: handled cards collapse to one line with fix-verification status
     ("checking it worked — looking good").
   - Keyboard: j/k step, Enter approves, i ignores (hint line at queue bottom).
5. **Detail lists**: 4-7 rows each, white primary text, "Show all N <noun>" button, expansion
   in place (no route change).

## Command center (board: "Command center")

1. "Marky assist · biggest win first" eyebrow + bold stat line of what's waiting.
2. Top-3 suggestion cards across ALL categories (same card anatomy, footer: primary action +
   ✕ Ignore), with "1 / N · Next ›" stepping.
3. Stat tiles: Google clicks, Visits, Fixes live, Pages improved, Pages needing fixes.
4. "Suggested next · Nothing changes without your approval" rows — including operational actions
   (run the page audit, with its cost stated on the button).
5. The nav-panel category list doubles as the queue overview (waiting counts, colored).

## Chat composer ("Ask Marky")

Phase-gated LAST (it depends on nothing above and nothing above depends on it).
- One button in the chrome on every page; opens a right-side panel (not full-screen) that inherits
  page context (category, property, date range, the card it was opened from).
- Opens with 3-4 page-scoped starter prompts, always including "Explain simpler".
- **Chat proposes, the queue disposes**: any request that would change the site materializes as a
  suggestion card in the right category's queue — never applied from chat. Read-only questions
  answer inline with cited data.
- Every chat capability also exists as a visible control; chat is an accelerator, not the nav.

## Honesty rules (non-negotiable, from CLAUDE.md + research)

- No demo data: every number renders from real queries; empty states say "Nothing needs you" or
  name the missing connection — never fake values. Mock numbers on the boards are placeholders.
- No score theater: no invented ROI/time-saved counters. Momentum = suggestions handled and
  fixes live (both real).
- No fabricated claims in generated content (existing validation stays mandatory).
- Metered actions carry their cost on the button ("reads up to 100 pages").

## Build order (each phase is one PR, shippable alone)

1. **Shell + Command center**: new nav (rail + panel + top bar), black skin tokens, home page.
   Old routes still reachable; nav switched. Riskiest UI change first, no new data needed.
2. **Getting found on Google**: full template on GSC data; queue backed by existing findings +
   Draft-the-fix; proves the card→change-request handoff.
3. **Your pages** (audit + proposals + changes absorbed), then **Who visits your site** (GA4).
4. **Your competition**, **Site health**, **Connections**.
5. **Ask Marky** composer.

Testing per phase: unit tests for queue state transitions (open/ignored/done, restore, dedup),
existing suites stay green, and a manual pass on the Lovable preview before merge.

## Out of scope (this redesign)

Auto-approve trust dial (later, after weeks of approvals), mobile-specific layout, deleting old
route files, any new rule or executor kind.
