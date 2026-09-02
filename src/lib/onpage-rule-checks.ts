import type { Database } from "@/integrations/supabase/types";

/**
 * Pure rule checks over already-stored OnPage crawl snapshots. Kept out of the
 * .server module so they test without mocks, matching pagespeed-rule-checks.ts
 * and search-console-rule-checks.ts. Nothing here reads a network or a
 * database.
 *
 * Session A of docs/handoffs/2026-08-28-parallel-rule-sessions.md. Ships the
 * five non-DECISION rules; the three crawl-meta rules
 * (`crawl_hit_its_page_cap`, `crawl_result_truncated`,
 * `crawl_started_never_collected`) are deferred to a follow-up PR per that
 * handoff's own fallback plan.
 *
 * Two invariants this whole module exists to protect, both from AGENTS.md and
 * the seo-measurement skill:
 *
 * 1. ABSENCE IS NEVER ZERO. `dataforseo_snapshots.totals.totalCount` is
 *    deliberately stored `null` when the provider omitted a total
 *    (onpage.server.ts parseResultItems), and `returned_row_count` is a
 *    row-limited sample, not a site total. Every function below treats a
 *    missing or non-numeric total as "unknown", never as 0, and every count
 *    the code cannot vouch for is worded as a floor ("at least N").
 * 2. PROVIDER ROWS ARE UNVERIFIED. `dataforseo/onpage.test.ts:100` states
 *    plainly that the OnPage result shape is read from provider
 *    documentation, not yet diffed against a live crawl. Every row read out
 *    of `payload.rows[]` here is read defensively: a field of the wrong type
 *    or a missing field drops that one piece of evidence rather than
 *    inventing a value for it.
 *
 * Both the crawl page cap (`MAX_CRAWL_PAGES`, onpage.server.ts:18) and the
 * result row cap (`RESULT_ROW_LIMIT`, onpage.server.ts:21) are 100, so every
 * count a rule below reports is bounded by the sample the crawl paid for.
 * Copy says "the pages the last site check read" or "the last crawl", never
 * "your site" or "every page", for exactly that reason.
 */

export type OnPageCheckRule =
  | "non_indexable_pages_found"
  | "crawl_pages_error_status"
  | "redirect_chain_present"
  | "duplicate_titles_across_pages"
  | "duplicate_descriptions_across_pages";

export type OnPageObservationDraft = {
  rule: OnPageCheckRule;
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: Database["public"]["Enums"]["impact_level"];
  confidence: number;
};

/**
 * A direct read of the crawl's own stored counters, not a statistic. Held
 * below 1 because the row shape itself is a stated assumption
 * (onpage.test.ts:100) and because the crawl is a capped 100-page sample, not
 * the whole site. Matches the 0.9 the URL Inspection facts already use in
 * search-console-rule-checks.ts:detectInspectionDrift for the same reason:
 * "facts read from [a provider] carry no sampling noise; capped below 1
 * because [the reading] itself can be stale/incomplete."
 */
const FACT_CONFIDENCE = 0.9;

/** A finding built from an incomplete or unreadable reading, not a measured fact. */
const UNKNOWN_READING_CONFIDENCE = 0.45;

// ---------------------------------------------------------------------------
// Shared defensive parsing over the `dataforseo_snapshots` row shape.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** One `dataforseo_snapshots` row for a detail-result kind, in raw DB shape. */
export type OnPageSnapshotRow = {
  totals: unknown;
  payload: unknown;
  returnedRowCount: number;
  possiblyTruncated: boolean;
  reportingDate: string;
};

/**
 * The shape every rule below actually needs, parsed once and defensively.
 * `totalCount` and `crawlProgress` stay `null` — never a substituted value —
 * when the stored `totals` blob does not carry them, per onpage.server.ts's
 * own stated invariant (comment above `parseResultItems`, line 100-102).
 * `rows` is left as `unknown[]`: each rule reads its own fields out of it
 * defensively, because the row shape itself is unverified provider data.
 */
export type OnPageResultSnapshot = {
  totalCount: number | null;
  crawlProgress: string | null;
  rows: unknown[];
  returnedRowCount: number;
  possiblyTruncated: boolean;
  reportingDate: string;
};

export function toResultSnapshot(row: OnPageSnapshotRow): OnPageResultSnapshot {
  const totals = isRecord(row.totals) ? row.totals : null;
  const payload = isRecord(row.payload) ? row.payload : null;
  const rows = payload && Array.isArray(payload["rows"]) ? payload["rows"] : [];
  return {
    totalCount: totals ? numOrNull(totals["totalCount"]) : null,
    crawlProgress: totals ? strOrNull(totals["crawlProgress"]) : null,
    rows,
    returnedRowCount: row.returnedRowCount,
    possiblyTruncated: row.possiblyTruncated,
    reportingDate: row.reportingDate,
  };
}

// ---------------------------------------------------------------------------
// non_indexable_pages_found -> health
// ---------------------------------------------------------------------------

type NonIndexableReasonBucket = "noindex" | "robots_txt" | "other";

/**
 * The provider's five documented `reason` values split by what Google's own
 * documentation says each one actually does:
 *
 * - `meta_tag` / `http_header` carry the noindex directive:
 *   "Do not show this page, media, or resource in search results."
 *   https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
 * - `robots_txt` does not: "A page that's disallowed in robots.txt can still
 *   be indexed if linked to from other sites" and "it is not a mechanism for
 *   keeping a web page out of Google."
 *   https://developers.google.com/search/docs/crawling-indexing/robots/intro
 * - `attribute` and `too_many_redirects` belong to neither documented
 *   consequence and are reported as a plain count, with no claim attached.
 */
function classifyNonIndexableReason(reason: unknown): NonIndexableReasonBucket | null {
  if (reason === "meta_tag" || reason === "http_header") return "noindex";
  if (reason === "robots_txt") return "robots_txt";
  if (reason === "attribute" || reason === "too_many_redirects") return "other";
  return null;
}

/**
 * Fires on the newest `onpage_non_indexable` snapshot when it reports at
 * least one non-indexable page. Grouped by documented consequence rather
 * than one blanket noindex claim (adversarial-review correction 1-2). A
 * snapshot that exists but cannot report a usable count speaks that in
 * words instead of going silent, which would otherwise read as zero
 * (correction 3). No snapshot at all stays silent: that absence is the
 * crawl prerequisite's job to name, not this rule's.
 */
export function checkNonIndexablePages(
  snapshot: OnPageResultSnapshot | undefined,
): OnPageObservationDraft[] {
  if (!snapshot) return [];

  const rows = snapshot.rows.filter(isRecord);
  let noindex = 0;
  let robotsTxt = 0;
  let other = 0;
  let unclassified = 0;
  for (const row of rows) {
    const bucket = classifyNonIndexableReason(row["reason"]);
    if (bucket === "noindex") noindex += 1;
    else if (bucket === "robots_txt") robotsTxt += 1;
    else if (bucket === "other") other += 1;
    else unclassified += 1;
  }

  let count: number;
  let isFloor = false;
  if (snapshot.totalCount !== null) {
    count = snapshot.totalCount;
  } else if (rows.length > 0) {
    // The collector nulls the total on purpose when the provider omits it;
    // returned_row_count is a lower bound read off a non-empty result, never
    // a substitute total (correction 3).
    count = snapshot.returnedRowCount;
    isFloor = true;
  } else {
    return [
      {
        rule: "non_indexable_pages_found",
        target: "site",
        title: "The site check did not report how many pages it cannot index",
        description:
          "The site check ran but this reading did not come back with a usable count of pages Google will not list. That is an unknown reading, not a clean one.",
        evidence: { reportingDate: snapshot.reportingDate },
        businessImpact: "low",
        confidence: UNKNOWN_READING_CONFIDENCE,
      },
    ];
  }

  if (count < 1) return [];

  const prefix = isFloor ? "At least " : "";
  const sentences: string[] = [];
  if (noindex > 0) {
    sentences.push(
      `${noindex} carr${noindex === 1 ? "ies" : "y"} a noindex tag, so Google will not list ${noindex === 1 ? "it" : "them"} ("Do not show this page, media, or resource in search results," developers.google.com/search/docs/crawling-indexing/robots-meta-tag).`,
    );
  }
  if (robotsTxt > 0) {
    sentences.push(
      `${robotsTxt} ${robotsTxt === 1 ? "is" : "are"} blocked in robots.txt, which stops Google reading ${robotsTxt === 1 ? "it" : "them"} but does not keep the address out of search results ("it is not a mechanism for keeping a web page out of Google," developers.google.com/search/docs/crawling-indexing/robots/intro).`,
    );
  }
  if (other > 0) {
    sentences.push(
      `${other} more ${other === 1 ? "is" : "are"} marked non-indexable for another reason the site check gave (too many redirects, or a page attribute), which carries neither of the consequences above.`,
    );
  }
  if (unclassified > 0 && rows.length > 0) {
    sentences.push(
      `${unclassified} more ${unclassified === 1 ? "was" : "were"} read but the reason the site check gave could not be classified.`,
    );
  }
  if (sentences.length === 0) {
    // The total is known but the per-row detail is not (rows truncated to a
    // shorter sample than the total, or unreadable). Never invent a split.
    sentences.push("The stored reading does not say which of these carry which block.");
  }

  return [
    {
      rule: "non_indexable_pages_found",
      target: "site",
      title: `${prefix}${count} of the pages the last site check read are set up so Google will not list them`,
      description:
        `Of the pages the last site check read, ${prefix.toLowerCase()}${count} are set up so Google will not list them. ${sentences.join(" ")} ` +
        `Some of these are probably meant to be hidden; this is the list, not a verdict on it.`,
      evidence: {
        count,
        isFloor,
        noindexCount: noindex,
        robotsTxtCount: robotsTxt,
        otherCount: other,
        unclassifiedCount: unclassified,
        rowsRead: rows.length,
        possiblyTruncated: snapshot.possiblyTruncated,
        sampleUrls: rows
          .slice(0, 10)
          .map((row) => strOrNull(row["url"]))
          .filter((url): url is string => url !== null),
      },
      businessImpact: "medium",
      confidence: FACT_CONFIDENCE,
    },
  ];
}

// ---------------------------------------------------------------------------
// crawl_pages_error_status -> health
// ---------------------------------------------------------------------------

/**
 * 400 is not a tuned number: it is RFC 9110's 4xx/5xx class boundary. Google,
 * HTTP status codes doc, fetched 2026-08-28:
 * "All 4xx errors, except 429, are treated the same: Google crawlers inform
 * the next processing system that the content doesn't exist" and
 * "5xx and 429 server errors prompt Google's crawlers to temporarily slow
 * down with crawling. For Google Search, already indexed URLs are preserved
 * in the index, but eventually dropped."
 * https://developers.google.com/search/docs/crawling-indexing/http-network-errors
 */
const HARD_ERROR_QUOTE =
  "Google's documentation: \"All 4xx errors, except 429, are treated the same: Google crawlers inform the next processing system that the content doesn't exist.\"";
const SLOWDOWN_QUOTE =
  "Google's documentation: \"5xx and 429 server errors prompt Google's crawlers to temporarily slow down with crawling. For Google Search, already indexed URLs are preserved in the index, but eventually dropped.\"";

/**
 * Fires on the newest `onpage_pages` snapshot when at least one row answered
 * with an error. Splits 4xx-except-429 (documented as index removal) from
 * 429/5xx (documented as a temporary slowdown, not removal) per correction 2,
 * never asserts Google itself has acted since DataForSEO's crawler is not
 * Googlebot (correction 1), treats any status below 100 — including the `0`
 * DataForSEO writes for a fetch that never completed — as unreadable rather
 * than healthy (correction 3), and states the crawl's own page cap when the
 * snapshot is truncated (correction 4). 401/410 are filed as a candidate to
 * confirm the address should still exist rather than as a fault, since a
 * deliberately retired or gated address answers exactly this way
 * (correction 6).
 */
export function checkPagesErrorStatus(
  snapshot: OnPageResultSnapshot | undefined,
): OnPageObservationDraft[] {
  if (!snapshot) return [];

  const rows = snapshot.rows.filter(isRecord);
  let unreadable = 0;
  const hard4xx: { url: string | null; status: number }[] = [];
  const slowdown: { url: string | null; status: number }[] = [];
  const decision: { url: string | null; status: number }[] = [];

  for (const row of rows) {
    const status = numOrNull(row["status_code"]);
    const url = strOrNull(row["url"]);
    if (status === null || status < 100) {
      unreadable += 1;
      continue;
    }
    if (status < 400) continue;
    if (status === 401 || status === 410) {
      decision.push({ url, status });
      continue;
    }
    if (status === 429 || status >= 500) {
      slowdown.push({ url, status });
      continue;
    }
    hard4xx.push({ url, status });
  }

  const errorCount = hard4xx.length + slowdown.length + decision.length;
  if (errorCount < 1) return [];

  const scopeNote = snapshot.possiblyTruncated
    ? " The check stopped at the first 100 addresses it crawled, so this is not necessarily the whole site."
    : "";

  const sentences: string[] = [];
  if (hard4xx.length > 0) {
    sentences.push(
      `${hard4xx.length} answered with a client error other than 429. ${HARD_ERROR_QUOTE}`,
    );
  }
  if (slowdown.length > 0) {
    sentences.push(`${slowdown.length} answered with a 429 or a server error. ${SLOWDOWN_QUOTE}`);
  }
  if (decision.length > 0) {
    sentences.push(
      `${decision.length} answered 401 or 410, which is what a deliberately retired or gated address looks like. Confirm whether ${decision.length === 1 ? "it" : "they"} should still exist rather than treating this as a fault.`,
    );
  }
  if (unreadable > 0) {
    sentences.push(
      `${unreadable} more ${unreadable === 1 ? "address" : "addresses"} returned no readable status code and ${unreadable === 1 ? "is" : "are"} counted as neither healthy nor an error.`,
    );
  }

  const noun = errorCount === 1 ? "address" : "addresses";
  const verb = errorCount === 1 ? "answers" : "answer";

  return [
    {
      rule: "crawl_pages_error_status",
      target: "site",
      title: `${errorCount} ${noun} the site check followed ${verb} with an error instead of a page`,
      description:
        `The site check received an error where it expected a page from ${errorCount} ${noun} it followed.${scopeNote} ` +
        `${sentences.join(" ")} ` +
        `The site check's crawler is not Googlebot, so this is worth confirming against Google's own view of these addresses (Search Console) before treating them as gone.`,
      evidence: {
        errorCount,
        hard4xxCount: hard4xx.length,
        slowdownCount: slowdown.length,
        decisionCount: decision.length,
        unreadableCount: unreadable,
        possiblyTruncated: snapshot.possiblyTruncated,
        sampleRows: [...hard4xx, ...slowdown, ...decision]
          .slice(0, 10)
          .map((r) => ({ url: r.url, statusCode: r.status })),
      },
      businessImpact: hard4xx.length > 0 ? "high" : "medium",
      confidence: FACT_CONFIDENCE,
    },
  ];
}

// ---------------------------------------------------------------------------
// redirect_chain_present -> health
// ---------------------------------------------------------------------------

/**
 * Fires on the newest `onpage_redirect_chains` snapshot's `totals.totalCount`
 * alone — the `returned_row_count` fallback is deleted per correction 1, since
 * that fallback is exactly what turned a deliberately-null total into "the
 * site is clean". Three absence states are rendered in words rather than one
 * silence standing in for all of them (correction 2): no snapshot at all, a
 * snapshot whose total came back unreadable, and a snapshot written mid-crawl
 * (`crawlProgress` not `"finished"`, correction 3) whose count is partial.
 * `possibly_truncated` makes the fired count a floor, "at least N"
 * (correction 4). One item in `/on_page/redirect_chains` is one full
 * redirect chain, not one hop — confirmed against DataForSEO's documented
 * response shape and recorded in
 * docs/integrations/dataforseo/DIGEST.md (correction 5) — so "addresses" is
 * the correct noun for the count.
 */
export function checkRedirectChainPresent(
  snapshot: OnPageResultSnapshot | undefined,
): OnPageObservationDraft[] {
  if (!snapshot) {
    return [
      {
        rule: "redirect_chain_present",
        target: "site",
        title: "The crawl has not reported on redirects yet",
        description:
          "No site crawl has read back which addresses redirect before answering, so this cannot say whether any do.",
        evidence: {},
        businessImpact: "low",
        confidence: UNKNOWN_READING_CONFIDENCE,
      },
    ];
  }

  if (snapshot.crawlProgress !== null && snapshot.crawlProgress !== "finished") {
    return [
      {
        rule: "redirect_chain_present",
        target: "site",
        title: "The site check was still running when redirects were last counted",
        description:
          "The last redirect reading was taken while the crawl was still in progress, so its count is partial and is not reported as the site's figure.",
        evidence: { crawlProgress: snapshot.crawlProgress },
        businessImpact: "low",
        confidence: UNKNOWN_READING_CONFIDENCE,
      },
    ];
  }

  if (snapshot.totalCount === null) {
    return [
      {
        rule: "redirect_chain_present",
        target: "site",
        title: "The last crawl did not report how many addresses redirect",
        description:
          "The redirect reading came back without a usable total, so this cannot say whether any addresses on the site redirect before a page answers.",
        evidence: { reportingDate: snapshot.reportingDate },
        businessImpact: "low",
        confidence: UNKNOWN_READING_CONFIDENCE,
      },
    ];
  }

  if (snapshot.totalCount === 0) return [];

  const count = snapshot.totalCount;
  const prefix = snapshot.possiblyTruncated ? "At least " : "";
  const noun = count === 1 ? "address" : "addresses";
  const verb = count === 1 ? "sends" : "send";

  const chainLengths = snapshot.rows
    .filter(isRecord)
    .map((row) => (Array.isArray(row["chain"]) ? row["chain"].length : null))
    .filter((n): n is number => typeof n === "number");
  const longest = chainLengths.length > 0 ? Math.max(...chainLengths) : null;
  const overTenNote =
    longest !== null && longest > 10
      ? ` The longest stored chain runs ${longest} hops, more than the 10 Google's crawlers follow by default ("By default, Google's crawlers follow up to 10 redirect hops," developers.google.com/search/docs/crawling-indexing/http-network-errors), so anything past that is never reached.`
      : "";

  return [
    {
      rule: "redirect_chain_present",
      target: "site",
      title: `${prefix}${count} ${noun} on the site redirect before a page answers`,
      description:
        `${prefix}${count} ${noun} on the site ${verb} Google somewhere else before a page answers. ` +
        `Google reads the page it ends at, not the address published: "Any content Google receives from the redirecting URL is ignored, and the final target URL's content is processed instead" (developers.google.com/search/docs/crawling-indexing/http-network-errors). ` +
        `Publish the address a visitor and Google actually land on.${overTenNote}`,
      evidence: {
        totalCount: snapshot.totalCount,
        possiblyTruncated: snapshot.possiblyTruncated,
        longestChainHops: longest,
      },
      businessImpact: "medium",
      confidence: FACT_CONFIDENCE,
    },
  ];
}

// ---------------------------------------------------------------------------
// duplicate_titles_across_pages / duplicate_descriptions_across_pages -> pages
// ---------------------------------------------------------------------------

type DuplicateTagCopy = {
  rule: "duplicate_titles_across_pages" | "duplicate_descriptions_across_pages";
  noun: string;
  absenceTitle: string;
  absenceDescription: string;
  citationSentence: string;
};

/**
 * `/on_page/duplicate_tags` (confirmed against DataForSEO's documented
 * response shape, recorded in docs/integrations/dataforseo/DIGEST.md) has no
 * `total_items_count` field at all, so `totals.totalCount` — read from that
 * field by `parseResultItems` — is always `null` for this kind. Correction 1
 * for both rules: read `returned_row_count` (== `items.length`, one item per
 * shared tag value / "accumulator") as the count instead of treating the
 * null as zero. `totalCount` is still checked defensively in case the
 * provider ever adds it.
 *
 * A snapshot that stored zero rows is indistinguishable, from what this
 * repo's own columns record, between "the crawl genuinely found no
 * duplicates" and "the parser could not read the result" (correction 2 for
 * both rules). `crawlProgress` is the one signal that survives that
 * ambiguity: it is read from the same parsed result object as `items`
 * (parseResultItems, onpage.server.ts), so its presence means the object was
 * at least parseable. Zero rows alongside a present `crawlProgress` is
 * treated as a genuine measured zero; zero rows with no `crawlProgress` and
 * no numeric total is treated as unreadable and named in words.
 */
function checkDuplicateTagGroup(
  snapshot: OnPageResultSnapshot | undefined,
  copy: DuplicateTagCopy,
): OnPageObservationDraft[] {
  if (!snapshot) {
    return [
      {
        rule: copy.rule,
        target: "site",
        title: copy.absenceTitle,
        description: copy.absenceDescription,
        evidence: {},
        businessImpact: "low",
        confidence: UNKNOWN_READING_CONFIDENCE,
      },
    ];
  }

  const readable =
    snapshot.crawlProgress !== null ||
    snapshot.totalCount !== null ||
    snapshot.returnedRowCount > 0;
  if (!readable) {
    return [
      {
        rule: copy.rule,
        target: "site",
        title: copy.absenceTitle,
        description: copy.absenceDescription,
        evidence: { reportingDate: snapshot.reportingDate },
        businessImpact: "low",
        confidence: UNKNOWN_READING_CONFIDENCE,
      },
    ];
  }

  let count: number;
  let isFloor = false;
  if (snapshot.totalCount !== null) {
    count = snapshot.totalCount;
  } else if (snapshot.returnedRowCount >= 1) {
    count = snapshot.returnedRowCount;
    isFloor = true;
  } else {
    count = 0;
  }

  if (count < 1) return [];

  const floor = isFloor || snapshot.possiblyTruncated;
  const prefix = floor ? "At least " : "";
  const setWord = count === 1 ? "set" : "sets";

  return [
    {
      rule: copy.rule,
      target: "site",
      title: `${prefix}${count} ${setWord} of pages share the same ${copy.noun}`,
      description:
        `${prefix}${count} ${setWord} of pages read by the last site crawl share one ${copy.noun}. ${copy.citationSentence} ` +
        `This reading comes from the site crawl's tag scan; the page-by-page audit may report shared ${copy.noun}s separately, over a different set of pages.`,
      evidence: { count, isFloor: floor, possiblyTruncated: snapshot.possiblyTruncated },
      businessImpact: "low",
      confidence: FACT_CONFIDENCE,
    },
  ];
}

/**
 * Google, title link doc: "If we've detected an issue on the page, we may
 * try to generate an improved title link from anchors, on-page text, or
 * other sources" — https://developers.google.com/search/docs/appearance/title-link.
 * Appearance and click-through only, never a ranking claim, per the
 * seo-measurement skill.
 */
export function checkDuplicateTitles(
  snapshot: OnPageResultSnapshot | undefined,
): OnPageObservationDraft[] {
  return checkDuplicateTagGroup(snapshot, {
    rule: "duplicate_titles_across_pages",
    noun: "tab title",
    absenceTitle: "The site crawl has not checked for duplicate tab titles yet",
    absenceDescription:
      "No readable duplicate-title reading is stored yet, so this cannot say whether any pages share a tab title.",
    citationSentence:
      "Google's own guidance is to avoid repeating the same title text across pages, and when it decides a title does not describe the page it may build its own from headings, on-page text or links instead of showing yours (developers.google.com/search/docs/appearance/title-link).",
  });
}

/**
 * Google, snippet doc: "Identical or similar descriptions on every page of a
 * site aren't helpful when individual pages appear in search results" —
 * https://developers.google.com/search/docs/appearance/snippet. Appearance
 * and click-through only, never a ranking claim.
 */
export function checkDuplicateDescriptions(
  snapshot: OnPageResultSnapshot | undefined,
): OnPageObservationDraft[] {
  return checkDuplicateTagGroup(snapshot, {
    rule: "duplicate_descriptions_across_pages",
    noun: "search description",
    absenceTitle: "The site crawl has not checked for duplicate search descriptions yet",
    absenceDescription:
      "No readable duplicate-description reading is stored yet, so this cannot say whether any pages share a search description.",
    citationSentence:
      "Google's own guidance: \"Identical or similar descriptions on every page of a site aren't helpful when individual pages appear in search results\" (developers.google.com/search/docs/appearance/snippet). Where Google uses that description under a result, it does not tell a searcher which page to open.",
  });
}
