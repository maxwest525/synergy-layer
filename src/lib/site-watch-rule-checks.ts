/**
 * Pure comparison of two nights of live-site reads (CODE-87, IDEA-22).
 *
 * The nightly watch fetches every sitemap address itself, records what the
 * server answered, and the next night compares each address with the night
 * before. Nothing here reads a network or a database, so it tests without
 * mocks, like onpage-rule-checks.ts.
 *
 * Three facts are compared, each with the documented consequence it rests on:
 *
 * - The status. Google, HTTP status codes doc, fetched 2026-08-28 for
 *   onpage-rule-checks.ts: "All 4xx errors, except 429, are treated the same:
 *   Google crawlers inform the next processing system that the content
 *   doesn't exist." 429 and the 5xx class are documented there as a crawl
 *   slowdown, not a removal, and are graded lower for that reason.
 * - noindex. Robots meta tag doc: "Do not show this page, media, or resource
 *   in search results."
 * - The canonical. No sentence is quoted: that the address Google is told to
 *   treat as the original changed overnight is the fact, and what it means
 *   for the page is the operator's to judge.
 *
 * A read the server did not answer at all (status null: a timeout or a
 * refused connection) is never compared, because an unanswered read is not a
 * page that stopped answering. The run reports those by count instead.
 */

export type SiteWatchRule =
  "page_stopped_answering" | "page_went_noindex" | "page_canonical_changed";

export type NightlyPageRead = {
  url: string;
  /** UTC calendar date of the read. */
  observedOn: string;
  status: number | null;
  finalUrl: string | null;
  noindex: boolean | null;
  canonical: string | null;
  error: string | null;
};

export type SiteWatchObservationDraft = {
  rule: SiteWatchRule;
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: "low" | "medium" | "high";
};

export type WatchPageFacts = {
  /** True when a robots meta tag or the X-Robots-Tag header says noindex. */
  noindex: boolean;
  /** The robots meta content as written, or null when there is none. */
  robots: string | null;
  canonical: string | null;
  title: string | null;
};

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  const value = match?.[2] ?? match?.[3] ?? null;
  return value === null ? null : value.trim();
}

/** The facts of one page read out of its HTML and its X-Robots-Tag header. */
export function watchFactsFromHtml(html: string, xRobotsTag: string | null): WatchPageFacts {
  let robots: string | null = null;
  let canonical: string | null = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attr(tag, "name")?.toLowerCase();
    // Google reads both the generic tag and the one addressed to its crawler.
    if ((name === "robots" || name === "googlebot") && robots === null)
      robots = attr(tag, "content");
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    if (rel.split(/\s+/).includes("canonical") && canonical === null) canonical = attr(tag, "href");
  }
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? titleMatch[1]!.replace(/\s+/g, " ").trim() || null : null;
  const noindex = /\bnoindex\b/i.test(robots ?? "") || /\bnoindex\b/i.test(xRobotsTag ?? "");
  return { noindex, robots, canonical, title };
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

const HARD_4XX_SENTENCE =
  "Google's HTTP status codes documentation: \"All 4xx errors, except 429, are treated the same: Google crawlers inform the next processing system that the content doesn't exist.\"";
const NOINDEX_SENTENCE =
  'Google\'s robots meta tag documentation on noindex: "Do not show this page, media, or resource in search results."';

/**
 * Every address read last night compared with its most recent earlier read.
 * An address with no earlier read, or whose latest read went unanswered, is
 * skipped: there is nothing to compare, or nothing trustworthy to compare.
 */
export function compareNights(
  previous: ReadonlyMap<string, NightlyPageRead>,
  current: readonly NightlyPageRead[],
): SiteWatchObservationDraft[] {
  const drafts: SiteWatchObservationDraft[] = [];
  for (const now of current) {
    const before = previous.get(now.url);
    if (!before || now.status === null) continue;
    const path = pathOf(now.url);
    const evidenceBase = {
      url: now.url,
      observedOn: now.observedOn,
      comparedWith: before.observedOn,
    };

    const answeredBefore = before.status !== null && before.status >= 200 && before.status < 300;
    if (answeredBefore && now.status >= 400) {
      const removal = now.status < 500 && now.status !== 429;
      drafts.push({
        rule: "page_stopped_answering",
        target: now.url,
        title: `${path} answered HTTP ${now.status} on ${now.observedOn} after HTTP ${before.status} on ${before.observedOn}`,
        description: removal
          ? `AOOS fetched this address itself on both nights. ${HARD_4XX_SENTENCE} Restore the page or redirect the address.`
          : `AOOS fetched this address itself on both nights. Google's HTTP status codes documentation treats 429 and the 5xx class as a signal to slow crawling rather than as removal, so this is a server or rate-limit fault to fix before it repeats.`,
        evidence: { ...evidenceBase, statusBefore: before.status, statusNow: now.status },
        businessImpact: removal ? "high" : "medium",
      });
    }

    if (before.noindex === false && now.noindex === true) {
      drafts.push({
        rule: "page_went_noindex",
        target: now.url,
        title: `${path} carried noindex on ${now.observedOn} and did not on ${before.observedOn}`,
        description: `AOOS read the page's robots directives itself on both nights. ${NOINDEX_SENTENCE} If this page should stay in search results, remove the directive; if the change was meant, nothing else is needed.`,
        evidence: { ...evidenceBase, noindexBefore: false, noindexNow: true },
        businessImpact: "high",
      });
    }

    if (before.canonical !== null && now.canonical !== null && before.canonical !== now.canonical) {
      drafts.push({
        rule: "page_canonical_changed",
        target: now.url,
        title: `${path} now names ${now.canonical} as its canonical, not ${before.canonical}`,
        description: `AOOS read the page's canonical link itself on both nights. The address the page tells Google to treat as the original changed overnight. If that was not intended, restore the earlier canonical; if it was, nothing else is needed.`,
        evidence: {
          ...evidenceBase,
          canonicalBefore: before.canonical,
          canonicalNow: now.canonical,
        },
        businessImpact: "medium",
      });
    }
  }
  return drafts;
}
