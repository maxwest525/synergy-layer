# Structure Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the structure gaps in the page audit — URL conventions, image layout stability, orphan pages, expected schema types, three standard checks the reference library lists and we do not run — and make the "this audit has never run" state loud on the category pages instead of a single grey line.

**Architecture:** Every new check is a pure rule in `src/lib/page-checks.ts` (`CHECKS` record + a branch in `evaluatePages`), exactly like the 22 that exist. `src/lib/audit-fixes.ts` holds one exhaustive `Record<CheckId, AuditFixTarget | null>`, so every new id must be added there or `tsc` fails — that is the intended forcing function. Server code (`page-audit.server.ts`) only plumbs stored rows in. View models (`your-pages.ts`, `site-health.ts`, `command-center.ts`) state absence; the components render what the view model says.

**Tech Stack:** TypeScript, Vitest (`<module>.test.ts` beside the module), TanStack Start server functions, Supabase reads.

**Spec:** this file. Verified against the code on 2026-08-21:

- `PageFacts` (page-checks.ts L7-27) carries **counts only**: `imageCount`, `imagesMissingAlt`, `internalLinks`, `externalLinks`. It carries **no** link hrefs, **no** image dimensions, **no** byte sizes.
- `extractPageFacts(html, markdown, pageUrl)` parses the raw HTML Firecrawl already returned for that page (`page-audit.server.ts` L413-414). Reading more fields out of that same string costs nothing new.
- Firecrawl is requested with `formats: ["rawHtml", "markdown"]` (L41). It returns **no resource byte sizes**, so image file weight is not extractable and no weight check is in this plan.
- `AnalyzedPage = { url, facts }` (L493). `final_url` is stored on the observation row but is **not** passed into `evaluatePages` — Task 6 changes that.
- Command center already says "The page audit has never run, so every page check is blind until it runs once." (`command-center.ts` L311-318) and already offers the `run-page-audit` suggested-next row with the cost (L444-459). Your pages and Site health do **not** — Task 5 fixes only those two.

## Global Constraints

- **No new providers and no new metered calls.** Every new check reads data the existing single Firecrawl scrape per page already returned, or data already stored. Tasks 2, 3 and 6 add *fields* to `PageFacts` that are parsed out of the same HTML string in the same call — the request body in `scrapePage` must not change, and `AUDIT_PAGE_LIMIT` stays 100.
- **A check that cannot read its input must not ship a guess.** Every new `PageFacts` field is declared optional (`field?: T`). When it is `undefined` on a stored row, the check that needs it produces **nothing** — never a defect, never a zero. Tests must cover the undefined case explicitly.
- **Every check carries a source comment**: a Google documentation URL with the quoted wording, or a `Stated assumption:` comment naming what would settle it. Follow the existing comment convention above each entry in `CHECKS`.
- **No thresholds invented to make a rule fire.** Where a number would have no citable floor (click-depth limit, URL length, image byte weight), the check is not shipped and the plan says why.
- **No demo data.** Absence is stated in words, never rendered as zero.
- **Copy style:** plain words, no rule ids on screen, numbers from stored rows only.
- **Surgical:** match file style, do not reformat untouched code. Repo-wide lint is known-failing; keep each touched file clean individually (`npx prettier --check <file>`, `npx eslint <file>`).
- Run tests as `npx vitest run <file>`; full gate at the end: `npx vitest run && npx tsc --noEmit`.
- Commit trailers on every commit:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TW5xuf3YnbAYaoqba4P6Z2
```

---

### Task 1: URL conventions — underscores and query strings

Reads the page address only, so it works against every already-stored observation with no `PageFacts` change.

**Files:**
- Modify: `src/lib/page-checks.ts` (`CheckId`, `CHECKS`, `evaluatePages`)
- Modify: `src/lib/audit-fixes.ts` (`PAGE_CHECK_FIX`)
- Test: `src/lib/page-checks.test.ts`

**Interfaces:**
- Adds `CheckId` members `"url_underscores"` and `"url_query_string"`.
- Adds `export function urlDefects(pageUrl: string): { underscores: boolean; queryString: boolean }` — exported so the test can drive it without building a whole `PageFacts`.

- [ ] **Step 1: Write the failing tests** in `page-checks.test.ts`:

```ts
describe("url conventions", () => {
  it("reads underscores and query strings out of the address", () => {
    expect(urlDefects("https://a.test/moving_services")).toEqual({
      underscores: true,
      queryString: false,
    });
    expect(urlDefects("https://a.test/moving-services?id=42")).toEqual({
      underscores: false,
      queryString: true,
    });
    expect(urlDefects("https://a.test/moving-services")).toEqual({
      underscores: false,
      queryString: false,
    });
  });

  it("ignores underscores in the host, which are not path words", () => {
    expect(urlDefects("https://my_host.test/movers").underscores).toBe(false);
  });

  it("does not parse a bare path as a defect it cannot see", () => {
    expect(urlDefects("not a url")).toEqual({ underscores: false, queryString: false });
  });

  it("reports both checks from evaluatePages", () => {
    const facts = extractPageFacts(HTML, "words", "https://a.test/one");
    const checks = evaluatePages([
      { url: "https://a.test/moving_services?ref=9", facts },
    ]).map((issue) => issue.check);
    expect(checks).toContain("url_underscores");
    expect(checks).toContain("url_query_string");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/lib/page-checks.test.ts` — expect FAIL (`urlDefects` is not exported).
- [ ] **Step 3: Implement `urlDefects`** in `page-checks.ts`, beside `sameHost`:

```ts
/**
 * What the address itself says. Parsed rather than pattern-matched so an
 * underscore in the host, which is not a word in a path, is not reported.
 * An address that will not parse yields nothing: guessing at a malformed URL
 * would report a defect on a path we invented.
 */
export function urlDefects(pageUrl: string): { underscores: boolean; queryString: boolean } {
  try {
    const parsed = new URL(pageUrl);
    return {
      underscores: parsed.pathname.includes("_"),
      queryString: parsed.search.length > 0,
    };
  } catch {
    return { underscores: false, queryString: false };
  }
}
```

- [ ] **Step 4: Add the two `CHECKS` entries** with their citations:

```ts
  // URL structure doc: "Consider using hyphens to separate words in your URLs,
  // as it helps users and Google identify concepts in the URL more easily. We
  // recommend that you use hyphens (-) instead of underscores (_) in your URLs."
  // https://developers.google.com/search/docs/crawling-indexing/url-structure
  url_underscores: {
    check: "url_underscores",
    label: "Underscores in the address",
    severity: "advice",
    instruction: (n) =>
      `Separate the words in ${n} page addresses with hyphens instead of underscores.`,
    fixableByWordingProposal: false,
  },
  // URL structure doc: the same page lists "URLs with unnecessary parameters"
  // among the URL problems that make addresses harder to read and to crawl.
  // https://developers.google.com/search/docs/crawling-indexing/url-structure
  // Stated assumption: a parameter on a page the site itself declares indexable
  // is worth naming; nothing here judges parameters on pages nobody declared.
  url_query_string: {
    check: "url_query_string",
    label: "Address carries parameters",
    severity: "advice",
    instruction: (n) =>
      `Give ${n} pages a plain address without parameters, so one page has one address.`,
    fixableByWordingProposal: false,
  },
```

- [ ] **Step 5: Add the branch** in `evaluatePages`, inside the `for` loop after the `og_missing` branch:

```ts
    const address = urlDefects(url);
    if (address.underscores)
      add("url_underscores", url, `The address separates words with underscores: ${url}`);
    if (address.queryString)
      add("url_query_string", url, `The address carries parameters: ${url}`);
```

- [ ] **Step 6: Add both ids to `PAGE_CHECK_FIX`** in `audit-fixes.ts` as `null` — no governed change kind rewrites a page address today, and pretending otherwise would offer a one-click fix that cannot run.
- [ ] **Step 7: Verify.** `npx vitest run src/lib/page-checks.test.ts src/lib/audit-fixes.test.ts && npx tsc --noEmit`, then `npx prettier --check` and `npx eslint` on both touched files.
- [ ] **Step 8: Commit** `feat(audit): check page addresses for underscores and parameters`.

---

### Task 2: Image dimensions — the layout-shift half of image checks

Only alt text is checked today. `width`/`height` attributes are in the HTML `extractPageFacts` already holds. Image **byte weight is not shipped**: Firecrawl returns `rawHtml` and `markdown` only, so no resource size is available and a weight check would be a guess.

**Files:**
- Modify: `src/lib/page-checks.ts` (`PageFacts`, `extractPageFacts`, `CheckId`, `CHECKS`, `evaluatePages`)
- Modify: `src/lib/audit-fixes.ts` (`PAGE_CHECK_FIX`)
- Test: `src/lib/page-checks.test.ts`

**Interfaces:**
- Adds `imagesMissingDimensions?: number` to `PageFacts` — optional, because rows stored before this change do not carry it.
- Adds `CheckId` member `"image_dimensions_missing"`.

- [ ] **Step 1: Write the failing tests:**

```ts
const IMAGE_HTML = `<html><body>
<img src="a.png" alt="A truck" width="800" height="600">
<img src="b.png" alt="A van">
<img src="c.png" alt="A box" width="400">
</body></html>`;

describe("image dimensions", () => {
  it("counts images that declare neither width nor height, and partial ones", () => {
    const facts = extractPageFacts(IMAGE_HTML, "words", "https://a.test/one");
    expect(facts.imagesMissingDimensions).toBe(2);
  });

  it("reports the check when any image is missing its size", () => {
    const facts = extractPageFacts(IMAGE_HTML, "words", "https://a.test/one");
    const checks = evaluatePages([{ url: "https://a.test/one", facts }]).map((i) => i.check);
    expect(checks).toContain("image_dimensions_missing");
  });

  it("says nothing at all when the stored row predates the field", () => {
    const facts = extractPageFacts(IMAGE_HTML, "words", "https://a.test/one");
    const older = { ...facts, imagesMissingDimensions: undefined };
    const checks = evaluatePages([{ url: "https://a.test/one", facts: older }]).map((i) => i.check);
    expect(checks).not.toContain("image_dimensions_missing");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/lib/page-checks.test.ts`.
- [ ] **Step 3: Extract the field.** In `extractPageFacts`, beside the existing `imagesMissingAlt` computation over the same `images` array:

```ts
  // Both attributes are needed for the browser to reserve the space; one alone
  // does not give it an aspect ratio to hold.
  const imagesMissingDimensions = images.filter(
    (tag) => attr(tag, "width") === null || attr(tag, "height") === null,
  ).length;
```

Add `imagesMissingDimensions,` to the returned object beside `imagesMissingAlt`.

- [ ] **Step 4: Add the `CHECKS` entry:**

```ts
  // Core Web Vitals doc: Cumulative Layout Shift "measures visual stability"
  // and Google names it one of the metrics Search reports on. An image with no
  // declared size gives the browser nothing to reserve, so the page moves under
  // the reader as it loads.
  // https://developers.google.com/search/docs/appearance/core-web-vitals
  image_dimensions_missing: {
    check: "image_dimensions_missing",
    label: "Images with no size declared",
    severity: "advice",
    instruction: (n) =>
      `Declare a width and height on the images on ${n} pages so the page stops jumping while it loads.`,
    fixableByWordingProposal: false,
  },
```

- [ ] **Step 5: Add the branch** in `evaluatePages`, beside the `image_alt_missing` branch, guarded on the field being present:

```ts
    // undefined means the row was stored before this was read, which is not the
    // same as zero images missing a size.
    const missingDimensions = facts.imagesMissingDimensions;
    if (missingDimensions !== undefined && missingDimensions > 0) {
      add(
        "image_dimensions_missing",
        url,
        `${missingDimensions} of ${facts.imageCount} images declare no width and height.`,
      );
    }
```

- [ ] **Step 6: Add the id to `PAGE_CHECK_FIX`** as `null`.
- [ ] **Step 7: Note the gap in the module header comment** of `page-checks.ts` in one sentence: image file weight is not checked because the render only returns HTML and text, and no byte size is available to read.
- [ ] **Step 8: Verify** as Task 1 Step 7.
- [ ] **Step 9: Commit** `feat(audit): flag images that declare no width and height`.

---

### Task 3: Orphan pages from the crawled link graph

The audit stores link **counts**, not link **targets**, so no orphan set can be computed from what is stored today. This task captures targets during the existing scrape and computes reachability from the home page. **Click depth is deliberately not a finding**: no Google document states a maximum depth, and inventing one would be a threshold chosen to make a rule fire. Reachable-or-not is threshold-free, so that is what ships. Depth is carried in the finding detail for the pages that fail.

**Files:**
- Modify: `src/lib/page-checks.ts` (`PageFacts`, `extractPageFacts`, `CheckId`, `CHECKS`, `evaluatePages`)
- Modify: `src/lib/audit-fixes.ts` (`PAGE_CHECK_FIX`)
- Test: `src/lib/page-checks.test.ts`

**Interfaces:**
- Adds `internalLinkTargets?: string[]` to `PageFacts` — absolute, same-host, hash and query stripped, de-duplicated.
- Adds `export function unreachablePages(pages: AnalyzedPage[]): Set<string>` — empty when the graph cannot be read.
- Adds `CheckId` member `"orphan_page"`.

- [ ] **Step 1: Write the failing tests:**

```ts
const linked = (url: string, targets: string[]): AnalyzedPage => ({
  url,
  facts: { ...extractPageFacts(HTML, "words", url), internalLinkTargets: targets },
});

describe("orphan pages", () => {
  it("collects same-host link targets, normalized, from the rendered html", () => {
    const facts = extractPageFacts(
      `<html><body><a href="/two#top">Two</a><a href="/two">Again</a>
       <a href="https://other.test/x">Away</a><a href="#here">Anchor</a></body></html>`,
      "words",
      "https://a.test/one",
    );
    expect(facts.internalLinkTargets).toEqual(["https://a.test/two"]);
  });

  it("reports a page nothing links to as an orphan", () => {
    const issues = evaluatePages([
      linked("https://a.test/", ["https://a.test/two"]),
      linked("https://a.test/two", ["https://a.test/"]),
      linked("https://a.test/hidden", ["https://a.test/"]),
    ]);
    const orphans = issues.filter((issue) => issue.check === "orphan_page").map((i) => i.url);
    expect(orphans).toEqual(["https://a.test/hidden"]);
  });

  it("never calls a page an orphan when the graph was not stored", () => {
    const issues = evaluatePages([
      { url: "https://a.test/", facts: extractPageFacts(HTML, "words", "https://a.test/") },
      { url: "https://a.test/hidden", facts: extractPageFacts(HTML, "words", "https://a.test/h") },
    ]);
    expect(issues.some((issue) => issue.check === "orphan_page")).toBe(false);
  });

  it("says nothing when no home page is among the read pages", () => {
    const issues = evaluatePages([linked("https://a.test/deep/one", [])]);
    expect(issues.some((issue) => issue.check === "orphan_page")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/lib/page-checks.test.ts`.
- [ ] **Step 3: Capture targets.** In `extractPageFacts`, in the existing `<a>` loop that already computes `internalLinks`, collect the resolved same-host address:

```ts
  const internalLinkTargets = new Set<string>();
  // ... inside the existing loop, in the `internal === true` branch:
      try {
        const target = new URL(href, pageUrl);
        internalLinkTargets.add(`${target.origin}${target.pathname.replace(/\/+$/, "") || "/"}`);
      } catch {
        // Unresolvable href: counted as a link, never added as a graph edge.
      }
```

Return `internalLinkTargets: [...internalLinkTargets],`. Use the same normalization (`origin + pathname`, trailing slash stripped, `/` preserved for the root) for node keys and edge keys so they compare.

- [ ] **Step 4: Implement `unreachablePages`:**

```ts
/**
 * Pages no chain of internal links reaches from the home page.
 *
 * Returns an empty set unless every read page carried its link targets: one
 * page whose links were never stored would make everything it links to look
 * unreachable, and a false orphan is worse than a silent one. Likewise, with no
 * home page among the read pages there is nowhere to start, so nothing is said.
 */
export function unreachablePages(pages: AnalyzedPage[]): Set<string> {
  if (pages.some((page) => page.facts.internalLinkTargets === undefined)) return new Set();
  const key = (url: string): string | null => { /* same normalization as above */ };
  // Breadth-first from the page whose pathname is "/", following stored targets
  // that resolve to a read page. Return the read pages never reached.
}
```

- [ ] **Step 5: Add the `CHECKS` entry:**

```ts
  // SEO starter guide: "the vast majority of the new pages Google finds every
  // day are through links," and links "connect your users and search engines to
  // other parts of your site."
  // https://developers.google.com/search/docs/fundamentals/seo-starter-guide
  orphan_page: {
    check: "orphan_page",
    label: "No path to the page from the home page",
    severity: "warning",
    instruction: (n) =>
      `Link to ${n} pages from somewhere a reader can reach from your home page. Nothing on the site points at them today.`,
    fixableByWordingProposal: false,
  },
```

- [ ] **Step 6: Add the branch.** Compute `const unreachable = unreachablePages(pages);` once above the loop beside `duplicateTitles`, then inside the loop:

```ts
    if (unreachable.has(url))
      add("orphan_page", url, "No chain of links from the home page reaches this page.");
```

- [ ] **Step 7: Add the id to `PAGE_CHECK_FIX`** as `null`.
- [ ] **Step 8: Record the decision** as a `Stated assumption:` comment above `unreachablePages`: click depth is computed nowhere because no Google document sets a maximum, and a depth limit would be a number chosen to make the rule fire.
- [ ] **Step 9: Verify** as Task 1 Step 7.
- [ ] **Step 10: Commit** `feat(audit): report pages no internal link path reaches`.

---

### Task 4: Expected schema type per page category

Today the only structured-data checks are missing and unreadable. This adds "the page has structured data, but not the type this kind of page is judged by."

**Files:**
- Modify: `src/lib/page-checks.ts` (`CheckId`, `CHECKS`, `evaluatePages`, new `pageCategory` + `EXPECTED_SCHEMA`)
- Modify: `src/lib/audit-fixes.ts` (`PAGE_CHECK_FIX`)
- Test: `src/lib/page-checks.test.ts`

**Interfaces:**
- Adds `export type PageCategory = "home" | "contact" | "question" | "article" | "service" | "other"`.
- Adds `export function pageCategory(pageUrl: string): PageCategory` — path-based, conservative, `"other"` when nothing matches.
- Adds `export const EXPECTED_SCHEMA: Record<PageCategory, string[]>`.
- Adds `CheckId` member `"structured_data_type_missing"`.

- [ ] **Step 1: Write the failing tests:**

```ts
describe("expected schema types", () => {
  it("classifies pages from the address alone, and admits when it cannot", () => {
    expect(pageCategory("https://a.test/")).toBe("home");
    expect(pageCategory("https://a.test/contact-us")).toBe("contact");
    expect(pageCategory("https://a.test/faq")).toBe("question");
    expect(pageCategory("https://a.test/blog/moving-day")).toBe("article");
    expect(pageCategory("https://a.test/services/packing")).toBe("service");
    expect(pageCategory("https://a.test/xyz")).toBe("other");
  });

  it("names the missing type when a page has other structured data", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/contact"), jsonLdTypes: ["WebPage"] };
    const issue = evaluatePages([{ url: "https://a.test/contact", facts }]).find(
      (entry) => entry.check === "structured_data_type_missing",
    );
    expect(issue?.detail).toContain("LocalBusiness");
  });

  it("does not fire on a page with no structured data at all", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/contact"), jsonLdTypes: [] };
    const checks = evaluatePages([{ url: "https://a.test/contact", facts }]).map((i) => i.check);
    expect(checks).toContain("structured_data_missing");
    expect(checks).not.toContain("structured_data_type_missing");
  });

  it("does not fire on a page it could not classify", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/xyz"), jsonLdTypes: ["WebPage"] };
    const checks = evaluatePages([{ url: "https://a.test/xyz", facts }]).map((i) => i.check);
    expect(checks).not.toContain("structured_data_type_missing");
  });

  it("accepts the expected type declared anywhere in the graph", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/faq"), jsonLdTypes: ["WebPage", "FAQPage"] };
    const checks = evaluatePages([{ url: "https://a.test/faq", facts }]).map((i) => i.check);
    expect(checks).not.toContain("structured_data_type_missing");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/lib/page-checks.test.ts`.
- [ ] **Step 3: Implement `pageCategory`.** Match on the parsed pathname, lowercased: `/` → home; contains `contact` → contact; contains `faq` or `questions` → question; first segment in `blog|news|articles|guides` → article; first segment in `services|service` with a second segment → service; everything else `other`. An address that will not parse returns `"other"`. Keep it a short table of prefixes, not a rule engine — it feeds one advisory check.
- [ ] **Step 4: Declare the expected types with per-type citations:**

```ts
/**
 * The structured data type Google's own documentation names for each kind of
 * page. Only types with a documented Google feature are listed; a page category
 * with nothing documented maps to an empty list and is never reported.
 */
export const EXPECTED_SCHEMA: Record<PageCategory, string[]> = {
  // Local business doc: "When users search for businesses ... Google Search
  // results may display a prominent Google rich result" for LocalBusiness.
  // https://developers.google.com/search/docs/appearance/structured-data/local-business
  home: ["LocalBusiness"],
  contact: ["LocalBusiness"],
  // FAQ doc: "A Frequently Asked Question (FAQ) page contains a list of
  // questions and answers pertaining to a particular topic."
  // https://developers.google.com/search/docs/appearance/structured-data/faqpage
  question: ["FAQPage"],
  // Article doc: "Adding Article structured data to your news, blog, and sports
  // article pages can help Google understand more about the web page."
  // https://developers.google.com/search/docs/appearance/structured-data/article
  article: ["Article", "BlogPosting", "NewsArticle"],
  // Stated assumption: Google documents no Service rich result. Service is
  // schema.org vocabulary a service page can carry so the offering is machine
  // readable; what would settle it is Google documenting a Service feature.
  service: ["Service"],
  other: [],
};
```

Accept a subtype as satisfying its parent (`BlogPosting` satisfies `article`, and `LocalBusiness` subtypes such as `MovingCompany` satisfy `home`/`contact`) by matching case-insensitively against the listed names **and** treating any stored type ending in a listed name as a match only where the test above proves it; otherwise list the accepted subtypes explicitly rather than guessing at schema.org's hierarchy. Add a `MovingCompany`-satisfies-`LocalBusiness` test if the existing `HTML` fixture's `MovingCompany` would otherwise be reported.

- [ ] **Step 5: Add the `CHECKS` entry:**

```ts
  // Structured data policy doc: "Using structured data enables a feature to be
  // present, it does not guarantee that it will be present" — the right type is
  // what makes the feature possible at all.
  // https://developers.google.com/search/docs/appearance/structured-data/sd-policies
  structured_data_type_missing: {
    check: "structured_data_type_missing",
    label: "Structured data of the wrong kind",
    severity: "advice",
    instruction: (n) =>
      `Describe ${n} pages with the kind of structured data Google reads for that kind of page.`,
    fixableByWordingProposal: false,
  },
```

- [ ] **Step 6: Add the branch** in `evaluatePages`, in the existing structured-data `else if` chain, as a further branch after `structured_data_missing` so a page with nothing is reported once, not twice:

```ts
    else {
      const expected = EXPECTED_SCHEMA[pageCategory(url)];
      const declared = facts.jsonLdTypes.map((type) => type.toLowerCase());
      if (expected.length > 0 && !expected.some((type) => declared.includes(type.toLowerCase()))) {
        add(
          "structured_data_type_missing",
          url,
          `This page describes itself as ${facts.jsonLdTypes.join(", ")}, and Google reads ${expected.join(" or ")} for this kind of page.`,
        );
      }
    }
```

- [ ] **Step 7: Add the id to `PAGE_CHECK_FIX`** as `null`.
- [ ] **Step 8: Verify** as Task 1 Step 7.
- [ ] **Step 9: Commit** `feat(audit): expect the documented schema type for each kind of page`.

---

### Task 5: Say plainly that the audit has never run

Command center already says it and already offers the metered row. Your pages says it in one grey line under the heading; Site health says it only inside tile subtext. Both should state it once, prominently, with the cost.

**Files:**
- Modify: `src/lib/your-pages.ts` (`NOT_AUDITED`, `YourPagesView`, `buildYourPages`)
- Modify: `src/lib/site-health.ts` (`NOT_CHECKED`, `SiteHealthView`, builder)
- Modify: `src/components/os/your-pages-page.tsx`, `src/components/os/site-health-page.tsx`
- Test: `src/lib/your-pages.test.ts`, `src/lib/site-health.test.ts`

**Interfaces:**
- Adds `readonly neverRunNotice: string | null` to both `YourPagesView` and `SiteHealthView`. Non-null **only** when nothing has been read (`facts.lastObservedAt === null` / `facts.siteObservedAt === null`).

- [ ] **Step 1: Write the failing tests** in both view-model test files:

```ts
it("states that the audit has never run, with what it costs", () => {
  const view = buildYourPages(facts({ lastObservedAt: null }));
  expect(view.neverRunNotice).toContain("never run");
  expect(view.neverRunNotice).toContain("100");
  expect(view.tiles.every((tile) => tile.value === null || tile.missingReason === null)).toBe(true);
});

it("says nothing once the audit has run", () => {
  expect(buildYourPages(facts({ lastObservedAt: "2026-08-20T00:00:00Z" })).neverRunNotice).toBeNull();
});
```

Mirror both for `buildSiteHealth` with `siteObservedAt`.

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/lib/your-pages.test.ts src/lib/site-health.test.ts`.
- [ ] **Step 3: Implement.** Add the field to both view types and set it in each builder. Copy, in plain words and matching the wording command center already uses so the two pages do not contradict each other:

```ts
const NEVER_RUN =
  "The page audit has never run. Every page level check below is blind until you run it once, and one run reads up to 100 pages.";
```

Site health's variant names its own subject: robots.txt, the sitemap, and whether pages render.

- [ ] **Step 4: Reword the two absence constants** so they say never rather than not yet: `NOT_AUDITED` → "The page audit has never run, so nothing here has been read from your pages." and `NOT_CHECKED` → "The site checks have never run, so nothing has been read from robots.txt or your sitemap."
- [ ] **Step 5: Render it.** In `your-pages-page.tsx`, between the header block (ends L234) and the tiles grid (L236), render a bordered warning panel when `view.neverRunNotice !== null`, reusing the existing `STATUS_TONE` warning classes rather than inventing a colour, with the existing `Link to="/pages/tools"` label as its action. Replace the L211-213 grey line's never-run branch with the panel so the same fact is not stated twice. Mirror in `site-health-page.tsx` at the equivalent position.
- [ ] **Step 6: Verify.** `npx vitest run src/lib/your-pages.test.ts src/lib/site-health.test.ts src/lib/nav-contract.test.ts && npx tsc --noEmit`, plus prettier and eslint on the four touched files.
- [ ] **Step 7: Commit** `feat(os): say plainly on both category pages that the audit has never run`.

---

### Task 6: Three standard checks from the reference library

From `https://www.screamingfrog.co.uk/learn-seo/` — Canonicals, Redirects, and the redirect guide's meta refresh. Each is computable from data the audit already stores or from the same HTML string, and each is one of the checks a standard crawl would run and we do not.

**Files:**
- Modify: `src/lib/page-checks.ts` (`PageFacts`, `extractPageFacts`, `AnalyzedPage`, `CheckId`, `CHECKS`, `evaluatePages`)
- Modify: `src/lib/page-audit.server.ts` (pass `finalUrl` into `evaluatePages`)
- Modify: `src/lib/audit-fixes.ts` (`PAGE_CHECK_FIX`)
- Test: `src/lib/page-checks.test.ts`

**Interfaces:**
- `AnalyzedPage` becomes `{ url: string; facts: PageFacts; finalUrl?: string | null }`.
- Adds `hasMetaRefresh?: boolean` to `PageFacts`.
- Adds `CheckId` members `"url_redirects"`, `"canonical_chain"`, `"meta_refresh"`.

- [ ] **Step 1: Write the failing tests:**

```ts
describe("redirects and canonical chains", () => {
  it("reports an address that did not serve itself", () => {
    const facts = extractPageFacts(HTML, "words", "https://a.test/one");
    const issue = evaluatePages([
      { url: "https://a.test/old", facts, finalUrl: "https://a.test/one" },
    ]).find((entry) => entry.check === "url_redirects");
    expect(issue?.detail).toContain("https://a.test/one");
  });

  it("ignores a trailing slash difference, which is not a redirect worth naming", () => {
    const facts = extractPageFacts(HTML, "words", "https://a.test/one");
    const checks = evaluatePages([
      { url: "https://a.test/one/", facts, finalUrl: "https://a.test/one" },
    ]).map((i) => i.check);
    expect(checks).not.toContain("url_redirects");
  });

  it("reports a canonical whose own target points somewhere else again", () => {
    const one = { ...extractPageFacts(HTML, "words", "https://a.test/one"), canonical: "https://a.test/two" };
    const two = { ...extractPageFacts(HTML, "words", "https://a.test/two"), canonical: "https://a.test/three" };
    const checks = evaluatePages([
      { url: "https://a.test/one", facts: one },
      { url: "https://a.test/two", facts: two },
    ]).filter((i) => i.check === "canonical_chain").map((i) => i.url);
    expect(checks).toEqual(["https://a.test/one"]);
  });

  it("reads a meta refresh out of the page", () => {
    const facts = extractPageFacts(
      `<html><head><meta http-equiv="refresh" content="0;url=/two"></head><body></body></html>`,
      "words",
      "https://a.test/one",
    );
    expect(facts.hasMetaRefresh).toBe(true);
    const checks = evaluatePages([{ url: "https://a.test/one", facts }]).map((i) => i.check);
    expect(checks).toContain("meta_refresh");
  });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run src/lib/page-checks.test.ts`.
- [ ] **Step 3: Implement the facts.** `hasMetaRefresh` from a `http-equiv="refresh"` meta tag using the existing `metaTags`/`attr` helpers. `AnalyzedPage` gains the optional `finalUrl`.
- [ ] **Step 4: Add the three `CHECKS` entries** with citations:

```ts
  // Reference: Screaming Frog's redirects guide — a redirect is an extra hop
  // between the address you published and the page that answers.
  // https://www.screamingfrog.co.uk/learn-seo/redirects/
  // Canonicalization doc: Google picks one address per page, so publishing the
  // address that redirects makes the site declare the hop rather than the page.
  // https://developers.google.com/search/docs/crawling-indexing/canonicalization
  url_redirects: { /* warning; instruct to publish the address that answers */ },
  // Reference: Screaming Frog's canonicals guide — a canonical pointing at a
  // page that itself canonicalizes elsewhere is a chain, and the middle page's
  // declaration is the one Google has to resolve.
  // https://www.screamingfrog.co.uk/learn-seo/canonicals/
  canonical_chain: { /* warning; instruct to point straight at the final page */ },
  // Reference: Screaming Frog's redirects guide lists meta refresh among the
  // redirect types, and it is the one that happens in the browser after the
  // page has already been served.
  // https://www.screamingfrog.co.uk/learn-seo/redirects/
  meta_refresh: { /* advice; instruct to redirect on the server instead */ },
```

Write full entries in the file's existing shape; the comments above are the required citations.

- [ ] **Step 5: Add the branches.** Compare `url` and `finalUrl` after the same normalization Task 3 uses (origin + pathname, trailing slash stripped) so a slash alone is not reported, and skip when `finalUrl` is `undefined` or `null`. Build a canonical map keyed by normalized address above the loop for the chain check, and report only the **first** page in the chain, matching the test.
- [ ] **Step 6: Pass `finalUrl` through.** In `page-audit.server.ts` L299-301, include `finalUrl: observation.finalUrl` in the mapped `AnalyzedPage`. No other server change.
- [ ] **Step 7: Add all three ids to `PAGE_CHECK_FIX`** as `null`.
- [ ] **Step 8: Verify.** `npx vitest run src/lib/page-checks.test.ts src/lib/page-audit.test.ts && npx tsc --noEmit`, plus prettier and eslint on the three touched files.
- [ ] **Step 9: Commit** `feat(audit): check redirects, canonical chains and meta refresh`.

---

### Task 7: Whole-suite gate and the honest gap list

**Files:**
- Modify: `src/lib/page-checks.ts` (module header comment only)

- [ ] **Step 1: Full gate.** `npx vitest run && npx tsc --noEmit`. Every failure is fixed here, not deferred.
- [ ] **Step 2: Confirm the exhaustive map.** `PAGE_CHECK_FIX` has one entry per `CheckId` — 22 before this plan, 31 after (2 + 1 + 1 + 1 + 3 new plus the originals). `tsc` proves it; state the count in the commit body rather than in a comment that will rot.
- [ ] **Step 3: Record what still is not checked** in the `page-checks.ts` module header, in plain sentences, so the next reader does not re-derive it: image file weight (no byte sizes are returned by the render), click depth (no citable maximum), and page speed per page (that is the stored PageSpeed reading on Site health, not this module).
- [ ] **Step 4: Lint the touched set.** `npx prettier --check` and `npx eslint` over every file this plan touched. Repo-wide lint stays known-failing and is not fixed here.
- [ ] **Step 5: Commit** `chore(audit): record what the page checks still cannot read`.
