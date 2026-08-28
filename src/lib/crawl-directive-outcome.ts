/**
 * Did a crawl-directive change actually let Google in?
 *
 * The wording lanes are graded on clicks, because a title or description
 * changes how a result is chosen. A robots.txt edit does not: it changes what
 * Google is permitted to fetch. Grading it on clicks would measure the wrong
 * thing and, at this property's volume, would report noise as a result. So
 * this lane is graded on indexation instead, which is the outcome the change
 * was actually for.
 *
 * The evidence is `search_console_url_inspections`, which already stores
 * `page_fetch_state` and `coverage_state` per URL and which, until now, no
 * code read. That makes this measurement a fact rather than an inference: a
 * page is either still blocked or it is not, so it answers at any traffic
 * level and needs no threshold.
 *
 * What it deliberately does NOT claim: that the page will rank, or that
 * Google will choose to index it. Google's own wording is that crawl
 * directives control what it may read, not what it decides to keep. An
 * unblocked page that Google has crawled and chosen not to index is reported
 * as exactly that, not as a failure of the change.
 */

/** Fetch states Search Console reports when robots.txt is what stopped it. */
const BLOCKED_FETCH_STATES = new Set([
  "BLOCKED_ROBOTS_TXT",
  "BLOCKED_4XX",
  "ROBOTS_TXT_UNAVAILABLE",
]);

/** Coverage states that mean the page is in the index. */
const INDEXED_COVERAGE = ["submitted and indexed", "indexed, not submitted"];

export type InspectionReading = {
  url: string;
  /** Search Console's own strings, stored verbatim. */
  pageFetchState: string | null;
  coverageState: string | null;
  inspectedAt: string;
};

export type CrawlDirectiveVerdict =
  | "unblocked_and_indexed"
  | "unblocked_not_yet_indexed"
  | "still_blocked"
  | "not_yet_inspected"
  | "unmeasurable";

export type CrawlDirectiveOutcome = {
  verdict: CrawlDirectiveVerdict;
  /** Plain sentence for the operator. No enum values, no state strings. */
  reason: string;
  pagesAffected: number;
  pagesStillBlocked: number;
  pagesIndexed: number;
  /** Pages whose state could not be read after the change went live. */
  pagesNotInspected: number;
};

export function isBlocked(reading: InspectionReading): boolean {
  const fetchState = reading.pageFetchState?.toUpperCase() ?? "";
  if (BLOCKED_FETCH_STATES.has(fetchState)) return true;
  return (reading.coverageState ?? "").toLowerCase().includes("blocked by robots");
}

export function isIndexed(reading: InspectionReading): boolean {
  const coverage = (reading.coverageState ?? "").toLowerCase();
  return INDEXED_COVERAGE.some((state) => coverage.includes(state));
}

/** The newest reading per URL at or after a moment, or before it. */
export function newestPerUrl(
  readings: readonly InspectionReading[],
): Map<string, InspectionReading> {
  const newest = new Map<string, InspectionReading>();
  for (const reading of readings) {
    const held = newest.get(reading.url);
    if (!held || reading.inspectedAt > held.inspectedAt) newest.set(reading.url, reading);
  }
  return newest;
}

/**
 * Grade one applied crawl-directive change.
 *
 * `after` must be readings taken strictly after the change went live; the
 * caller is responsible for that split, because only it knows `live_at`.
 */
export function gradeCrawlDirectiveChange(input: {
  affectedUrls: readonly string[];
  after: readonly InspectionReading[];
}): CrawlDirectiveOutcome {
  const affected = [...new Set(input.affectedUrls)];
  if (affected.length === 0) {
    return {
      verdict: "unmeasurable",
      reason:
        "This change did not record which pages it was meant to unblock, so there is nothing to check it against.",
      pagesAffected: 0,
      pagesStillBlocked: 0,
      pagesIndexed: 0,
      pagesNotInspected: 0,
    };
  }

  const afterByUrl = newestPerUrl(input.after);
  let stillBlocked = 0;
  let indexed = 0;
  let notInspected = 0;

  for (const url of affected) {
    const reading = afterByUrl.get(url);
    if (!reading) {
      notInspected += 1;
      continue;
    }
    if (isBlocked(reading)) stillBlocked += 1;
    else if (isIndexed(reading)) indexed += 1;
  }

  const base = {
    pagesAffected: affected.length,
    pagesStillBlocked: stillBlocked,
    pagesIndexed: indexed,
    pagesNotInspected: notInspected,
  };

  if (notInspected === affected.length) {
    return {
      ...base,
      verdict: "not_yet_inspected",
      reason: `Google has not been asked about ${affected.length === 1 ? "this page" : "these pages"} since the change went live, so there is nothing to read yet.`,
    };
  }

  if (stillBlocked > 0) {
    return {
      ...base,
      verdict: "still_blocked",
      reason: `${stillBlocked} of ${affected.length} pages are still blocked from being read after this change. The edit is live in the file, so something else is stopping Google.`,
    };
  }

  if (indexed > 0) {
    return {
      ...base,
      verdict: "unblocked_and_indexed",
      reason: `Google can now read ${affected.length === 1 ? "this page" : "these pages"}, and ${indexed} of ${affected.length} ${indexed === 1 ? "is" : "are"} in the index.`,
    };
  }

  return {
    ...base,
    verdict: "unblocked_not_yet_indexed",
    reason: `Nothing is blocking Google from reading ${affected.length === 1 ? "this page" : "these pages"} any more. None are in the index yet, which is a choice Google makes separately from being allowed in.`,
  };
}
