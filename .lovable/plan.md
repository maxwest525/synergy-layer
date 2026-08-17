# Make AOOS readable: a full pass on pages, wording, and workflow

Right now the OS is technically correct and humanly unreadable. Every screen speaks in internal vocabulary (lanes, findings, candidates, ledgers, states) and several screens are broken or empty in a way that looks like a bug rather than "nothing to do yet". This plan fixes the real defects first, then rewrites the surfaces so a normal person can understand what they're looking at and what to do next.

## Part 1 — Real defects (fix before any wording work)

1. **"Search Console observation failed — permission denied for function append_change_measurement_observation"**
   Confirmed cause: that database function only grants execute to the service role, so every operator-run observation dies partway through. Grant execute to signed-in operators, then re-run the observation so the failure card resolves for a real reason instead of being manually cleared.
2. **Provider spend crashes the window**
   The page loads up to 2000 raw request rows and totals them in the browser with no error boundary on the suspense path. Replace with an aggregated read (counts and sums computed in the database) plus a loading and error state.
3. **Ads page not loading / weird route**
   Move `/ads/advertisers` to `/ads`, keep a redirect from the old path, and give the page a real loading skeleton and error state so a slow SerpAPI account check doesn't look like a dead page.
4. **Slow, dead skeletons on Evidence pages**
   Authority, Spend, Operators, Changes each fetch on a bare suspense query. Add proper pending components, a visible page frame that renders immediately (title and back link appear before data), and empty states that say why something is empty.
5. **Narrow / off-centre layout** seen in the screenshots: the page frame renders before the shell hydrates, so content sits in a squeezed column. Pin the content container width in the shell itself so the frame is stable on first paint.

## Part 2 — Fix the Action Center model

The core confusion: the Action Center currently mixes three unrelated things and never explains them.

- **Failures are not actions.** "Search Console observation failed" is a system health problem, not a marketing decision. Failures move to a separate **System health** strip at the top of the Action Center: what broke, when, and a Retry button. Not a card you "clear".
- **"In progress" is not a growing log.** Today every approved change stays in progress forever. Rework it into a bounded **Live changes** list: only changes that are approved but not yet published-and-verified. Once verified or rolled back, it leaves the list and lives in Changes history.
- **Action Center vs Recommendations is redundant.** Recommendations become the *source* (observations the system generated) and the Action Center becomes the *only* place where you decide. Recommendations page is relabelled **Observations** and loses its approve buttons; anything actionable is promoted into the Action Center as a decision card.

Each Action Center card gets a fixed, plain-English anatomy:

```text
What we saw        one sentence, no jargon
Why it matters     the concrete risk or opportunity
What happens if    you approve, in plain terms
[ Review ]  [ Approve ]  [ Not now ]
```

## Part 3 — Say what things are (definitions pass)

Every workspace gets a one-line "what this is" under the title and, where the concept is non-obvious, a short glossary line on each card. Concretely:

| Page | New name | One-line definition shown on the page |
|---|---|---|
| Action Center | Action center | Decisions waiting on you. Nothing here happens automatically. |
| Recommendations | Observations | Things the system noticed. Not yet a decision. |
| Authority findings | Trust gaps | Pages missing the proof Google looks for, like reviews, credentials, or authorship. |
| Ads transparency | Competitor ads | Ads your competitors are running right now, pulled from Google's public ad library. |
| Provider spend | Data costs | What each outside data source has cost you this month. |
| Measurement | Site health | Speed, indexing, and traffic evidence collected from Google. |
| Changes | Page changes | Edits proposed to your website, and where each one stands. |

## Part 4 — Competitor ads, made usable

You correctly called out that you can't tell who's being checked or see results. Rework `/ads`:

- Top line states plainly: Google's ad library is free; the API service that reads it charges per lookup, and you have N lookups left.
- **Who we're watching** — the list of competitor domains being checked, with add and remove.
- **What they're running** — the actual creatives found, grouped by competitor, with headline, destination, and when it was observed. This data already exists and is currently invisible.
- Confirmed advertiser records collapse into that competitor's row instead of being a separate "decided candidates" audit wall.

## Part 5 — Workflow surface

- Every detail page (`/changes/$id`, `/workflows/$id`, `/recommendations/$id`, `/agents/$id`) gets a breadcrumb back to its list. Several currently have no way out.
- Workflow steps get plain labels and a one-line "this step reads X" / "this step writes Y" so it's obvious which steps are safe and which need approval.
- Each workflow card shows: last run, outcome, next scheduled run, and whether it is waiting on you.

## Technical notes

- One migration: `GRANT EXECUTE ON FUNCTION public.append_change_measurement_observation(...) TO authenticated`. No schema change.
- New aggregated spend read (server function computing counts and sums server-side) replacing the 1000-row-per-provider fetch.
- Route change: `/ads/advertisers` to `/ads`, with the old path redirecting; inbox href resolver in `src/routes/index.tsx` updated to match.
- Action Center lane logic in `src/lib/action-center.ts` gains a `system_health` classification for failure items and a bounded definition of `in_progress`; existing unit tests updated.
- No changes to evidence, provenance, approval gating, or execution guards. Everything here is presentation plus the one grant and one query rewrite.

## Order of work

1. Grant fix, spend query fix, ads route and loading states (the visibly broken things).
2. Action Center restructure and card anatomy.
3. Naming and definitions pass across all workspaces.
4. Competitor ads rework.
5. Workflow labels and breadcrumbs.
