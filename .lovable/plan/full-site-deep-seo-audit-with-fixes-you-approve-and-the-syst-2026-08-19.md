# Full-site deep SEO audit, with fixes you approve and the system executes

Today the audit reads up to 40 pages Google already reported, runs 22 on-page
checks, and shows findings. It stops there: nothing turns a finding into a
proposed change, and the technical layer (crawlability, status codes, redirects,
speed) is not audited at all. This closes both gaps.

## 1. Audit the whole site, not just pages Google reported

- Build the page list from three sources merged and de-duplicated: the site's
  own `sitemap.xml`, internal links found while crawling, and Search Console
  reported pages. A page missing from the sitemap is itself a finding.
- Raise the ceiling from 40 pages to the full discovered set, crawled in
  batches with a per-run cap and a resume marker so a large site finishes over
  successive runs instead of failing.
- Every page stores one immutable observation with its fetch status, final URL
  after redirects, and render source. A page that fails to render is stored
  with the reason, never skipped.

## 2. Add the technical layer

New site-level checks alongside the existing 22 page checks:

- robots.txt reachable, not blocking indexable pages, sitemap declared
- sitemap.xml valid, reachable, listing only 200-status canonical URLs
- HTTP status per page: 404s, 5xx, redirect chains and loops, mixed http/https
- canonical correctness: self-reference, cross-page conflicts, canonical to a
  redirecting or non-200 URL
- indexability conflicts: noindex on a page in the sitemap, noindex plus
  canonical disagreement
- Core Web Vitals and mobile usability per template page, from the PageSpeed
  read that currently stores nothing
- duplicate and near-duplicate title, description and H1 across the whole site
- orphan pages: in the sitemap but reachable from no internal link

## 3. Every finding becomes a proposal you can approve

Each finding gets a **Propose the fix** action that creates a real
`change_request` with the exact before and after text, the evidence that
justifies it, and its executability:

- Findings whose fix lands in an already governed file (`page.metadata`,
  `site.crawl_directives`, `site.structured_data`, `service.title_h1`) are
  fully executable: approve, and the executor commits the diff with the
  base-revision guard, then verifies the published page.
- Findings that need a file no change kind owns are still proposed, marked
  **needs a new change kind**, and filed on the roadmap rather than silently
  dropped. Nothing pretends to be executable when it is not.
- Wording for titles, descriptions and H1s is drafted from the page's own
  content and its Search Console queries, never invented.

## 4. One audit screen that reads as instructions

`/pages` becomes the audit workspace, grouped by severity:

- A headline: "18 pages have a problem. 11 can be fixed now."
- Each row is fact plus imperative plus one action:
  "`/services/local-moving` title is 78 characters, over Google's 60 - propose a
  shorter title".
- Bulk propose across a whole check, so 12 missing descriptions become 12
  change requests in one approval pass.
- A technical section for the site-level findings, each with the same action
  shape.

## 5. Run it on a cadence

Register `site-audit-weekly` as a read-only observation, gated by the same rule
as every other cadence: it only turns on after one full audit has stored rows.
Findings that reappear are the same finding with a longer history, not a new
one.

## Technical notes

- New checks extend `src/lib/page-checks.ts` (`CheckId` union plus `CHECKS`
  definitions) so severity, copy and grouping stay in one place.
- Crawl and discovery live in `src/lib/page-audit.server.ts`, using Firecrawl
  for render and plain fetch for status and redirect facts.
- Site-level findings store to a new `site_audit_findings` table, tenant
  scoped, with GRANTs and RLS in the same migration.
- Proposal creation reuses `change_requests` and
  `public.transition_change_request`; executability is decided by
  `src/lib/execution/allowlist.ts`, unchanged.
- Approval stays required before any external write. Nothing in the audit path
  mutates the site.
