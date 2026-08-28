# Status: OPEN — three of six measurement items done, the title/H1 default is the one that matters

Written 2026-08-28. Supersedes the merge-train notes in
[`2026-08-28-audit-fix-train-context.md`](2026-08-28-audit-fix-train-context.md),
which is now closed: all ten PRs from that train are merged and `main` is
green.

## 1. The finding that matters most, and it is NOT fixed

The operator's standing complaint through this whole session was that **the
system keeps reverting to title and H1**. That complaint is correct, it is one
line of code, and nothing merged so far changes it:

```ts
// src/lib/finding-fix-target.ts
export function proposalKindForRule(rule: string): FixProposalKind {
  return rule === "weak_ctr_page" ? "page_metadata" : "title_h1";
}
```

Every rule finding except `weak_ctr_page` drafts as a title/H1 proposal. Not
because title/H1 is the right lane for it, but because it was the first lane
built and became the default for everything.

Related title/H1 primacy still in place:

- `proposals/daily.server.ts` files only `create_title_h1_proposal`, so the
  nightly autonomous job can produce nothing else.
- The "write it again" verb exists only for `title_h1` proposals
  (`suggestion-queue.ts`).
- Only 8 of 26 rules have any governed fix target at all
  (`finding-fix-target.ts`), so the other 18 get no draft verb.

**Whoever picks this up: start here, not with more measurement.** Measurement
was extended in this session; the default was not, and the default is what the
operator is actually seeing.

## 2. What is merged and live-pending

`main` carries ten merged PRs from the audit train plus PR #82 (renderer
fallback). Gate on `main`: lint 0 errors, typecheck clean, 1437 tests.

**Not yet published to Lovable.** Everything below is in `main` and inert
until an operator hits Publish, then applies pending migrations and runs the
registry sync.

## 3. What is on PR #83, open and green

Branch `claude/renderer-fallback-drafting`, 1458 tests, gate green.

1. **Drafting survives a dead renderer.** `readLivePageWording()` falls back to
   the page audit's stored title/H1. Publish proof deliberately still demands
   a fresh render.
2. **PageSpeed is the fifth finding writer.** `page_lcp_poor`, `page_cls_poor`,
   Google's published bands only, lab-vs-field stated on screen, bucketed
   `fact`. `PAGESPEED_API_KEY` corrected to optional.
3. **`h2_missing` added, `headingSkips` deleted.** The first is grounded and
   claims nothing about ranking; the second is removed because Google states
   heading order does not matter.
4. **Robots lane measured on indexation**, reading
   `search_console_url_inspections` — which had been stored per URL and read
   by nothing since the inspection sweep landed.

## 4. Open work, in the order it is worth doing

| # | Item | Why it matters |
| --- | --- | --- |
| 1 | **Break the title/H1 default** (§1) | The operator's actual complaint |
| 2 | H2/H3 edit lane | `h2_missing` currently reports with nowhere to go |
| 3 | Keyword to page-content rules | Keyword rules never touch page text |
| 4 | Umami / backlinks / SerpAPI findings paths | Three connectors still at stage three |

## 5. Standing operator decisions, unchanged

Google Ads wire-or-delete; n8n wire-or-delete; agents build-or-remove; the
free SerpAPI gate revalidation; the six-domain competitor shortlist in
`/competitors`; the two unbuilt category pages. None are blocked on code.

## 6. Process note worth keeping

Three separate times this session an agent surfaced a stored signal that
nothing read (`h2Count`, `headingSkips`, URL Inspection coverage fields,
PageSpeed readings). The pattern is consistent enough to be worth a standing
check: **when adding a parser or a collector, add its consumer in the same
change, or record in `CURRENT_BUILD.md` that it has none and why.**
