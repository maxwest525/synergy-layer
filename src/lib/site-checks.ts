/**
 * Pure site wide technical checks. These sit above the per page checks in
 * page-checks.ts: they read what the whole site tells a crawler through
 * robots.txt and the sitemap, and how much of the site the audit actually
 * managed to read. Nothing here fetches, guesses, or estimates.
 */

import type { Severity } from "./page-checks";
import { blockedPaths } from "./robots-rules";

export type SiteCheckId =
  | "robots_missing"
  | "robots_blocks_site"
  | "robots_blocks_pages"
  | "sitemap_missing"
  | "sitemap_unreachable"
  | "sitemap_empty"
  | "sitemap_not_declared"
  | "sitemap_coverage_gap"
  | "pages_unreadable";

/** What the crawl directives of the whole site actually said when read. */
export type SiteFacts = {
  origin: string;
  /** null when robots.txt could not be fetched at all. */
  robotsStatus: number | null;
  robotsBody: string | null;
  /** Sitemap addresses declared inside robots.txt. */
  declaredSitemaps: string[];
  /** The sitemap that was read, if any. */
  sitemapUrl: string | null;
  sitemapStatus: number | null;
  sitemapUrlCount: number | null;
  /** Addresses Google reported but the sitemap never lists. */
  pagesMissingFromSitemap: string[];
  /** Pages the audit tried to read and failed. */
  unreadablePages: string[];
  /**
   * Every page address the audit knows about, so robots.txt can be checked
   * against them one by one rather than only for a site-wide block.
   */
  knownPages?: string[];
  /**
   * The pages the site itself declares it wants indexed: everything the sitemap
   * lists, plus anything Search Console has already reported.
   *
   * This is what makes a robots.txt block actionable rather than ambiguous. A
   * page that is disallowed and declared nowhere is a working configuration -
   * an admin screen, a cart, a search results page - and nothing to report. A
   * page that is disallowed *and* declared is the owner contradicting
   * themselves in two files, which is the state Google reports as "Indexed,
   * though blocked by robots.txt".
   */
  declaredPages?: string[];
};

export type SiteFinding = {
  check: SiteCheckId;
  label: string;
  severity: Severity;
  instruction: string;
  detail: string;
  /** The governed change kind that can fix this, or null when it is manual. */
  fixableByChangeKind: "site.crawl_directives" | null;
};

/** True when robots.txt disallows every crawler from the whole site. */
export function robotsBlocksEverything(body: string): boolean {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.length > 0);
  let inWildcardGroup = false;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    const key = (rawKey ?? "").trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") inWildcardGroup = value === "*";
    else if (key === "disallow" && inWildcardGroup && value === "/") return true;
  }
  return false;
}

/** Every sitemap address declared in a robots.txt body. */
export function declaredSitemapsFrom(body: string): string[] {
  const found: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (match?.[1]) found.push(match[1]);
  }
  return [...new Set(found)];
}

/** Every <loc> address in a sitemap or sitemap index document. */
export function sitemapLocations(xml: string): string[] {
  const found = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => match[1] ?? "");
  return [...new Set(found.filter((value) => value.startsWith("http")))];
}

/** True when the document is a sitemap index rather than a page list. */
export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex\b/i.test(xml);
}

function normalizePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Addresses Google reported that the sitemap never lists. */
export function pagesMissingFromSitemap(input: {
  reportedUrls: string[];
  sitemapUrls: string[];
}): string[] {
  const listed = new Set(
    input.sitemapUrls.map(normalizePath).filter((value): value is string => value !== null),
  );
  if (listed.size === 0) return [];
  return input.reportedUrls.filter((url) => {
    const key = normalizePath(url);
    return key !== null && !listed.has(key);
  });
}

/**
 * The path part of every page address the audit knows about, on this host only.
 *
 * robots.txt rules are written against paths, so an address that will not parse
 * is dropped rather than guessed at: reporting a page as blocked on a path we
 * invented would be worse than not reporting it.
 *
 * A `sc-domain:` property spans every subdomain, and each host serves its own
 * robots.txt. Only the origin's own file was read, so pages on another host are
 * dropped rather than judged by a rule that never applied to them.
 */
function pathsOf(pages: readonly string[], origin: string): string[] {
  const paths = pages.map((page) => {
    try {
      const parsed = new URL(page);
      if (parsed.origin !== origin) return null;
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      // A bare path can only have come from this origin.
      return page.startsWith("/") ? page : null;
    }
  });
  return [...new Set(paths.filter((path): path is string => path !== null))];
}

function sample(urls: string[], count = 3): string {
  const head = urls.slice(0, count).join(", ");
  return urls.length > count ? `${head} and ${urls.length - count} more` : head;
}

/** Every real site wide defect the read facts prove, worst first. */
export function evaluateSite(facts: SiteFacts): SiteFinding[] {
  const findings: SiteFinding[] = [];

  if (facts.robotsStatus === null || facts.robotsStatus >= 400) {
    findings.push({
      check: "robots_missing",
      label: "No robots file",
      severity: "warning",
      instruction: "Publish a robots.txt so crawlers know what they may read.",
      detail:
        facts.robotsStatus === null
          ? `${facts.origin}/robots.txt could not be fetched at all.`
          : `${facts.origin}/robots.txt returned HTTP ${facts.robotsStatus}.`,
      fixableByChangeKind: "site.crawl_directives",
    });
  } else if (facts.robotsBody && robotsBlocksEverything(facts.robotsBody)) {
    findings.push({
      check: "robots_blocks_site",
      label: "Robots file blocks the whole site",
      severity: "critical",
      instruction: "Remove the site wide Disallow: / from robots.txt so Google can read the site.",
      detail: `${facts.origin}/robots.txt disallows every crawler from every page.`,
      fixableByChangeKind: "site.crawl_directives",
    });
  } else if (facts.robotsBody) {
    // Not the whole site, but some of it. Only pages the site declares it wants
    // indexed are reported: a page that is disallowed and declared nowhere is a
    // working configuration, not a defect. Named paths rather than a count, so
    // the operator can open the file and see the rule that did it.
    const blocked = blockedPaths(
      facts.robotsBody,
      pathsOf(facts.declaredPages ?? [], facts.origin),
    );
    if (blocked.length > 0) {
      findings.push({
        check: "robots_blocks_pages",
        label: `Robots file blocks ${blocked.length} pages you asked Google to index`,
        severity: "critical",
        instruction: `Remove the robots.txt rule disallowing ${blocked.length} pages your sitemap lists. Google cannot index what it is told not to read.`,
        detail: `Your sitemap asks Google to index ${sample([...blocked])}, and robots.txt tells it not to read them.`,
        fixableByChangeKind: "site.crawl_directives",
      });
    }
  }

  if (facts.robotsBody !== null && facts.declaredSitemaps.length === 0) {
    findings.push({
      check: "sitemap_not_declared",
      label: "Sitemap not declared to crawlers",
      severity: "advice",
      instruction: "Add a Sitemap: line to robots.txt so crawlers find the sitemap immediately.",
      detail: `${facts.origin}/robots.txt names no sitemap.`,
      fixableByChangeKind: "site.crawl_directives",
    });
  }

  if (facts.sitemapUrl === null) {
    findings.push({
      check: "sitemap_missing",
      label: "No sitemap found",
      severity: "critical",
      instruction: "Publish a sitemap.xml listing every page you want Google to index.",
      detail: `No sitemap was reachable at ${facts.origin}.`,
      fixableByChangeKind: "site.crawl_directives",
    });
  } else if (facts.sitemapStatus !== null && facts.sitemapStatus >= 400) {
    findings.push({
      check: "sitemap_unreachable",
      label: "Sitemap cannot be read",
      severity: "critical",
      instruction: "Fix the sitemap address so crawlers can read it.",
      detail: `${facts.sitemapUrl} returned HTTP ${facts.sitemapStatus}.`,
      fixableByChangeKind: "site.crawl_directives",
    });
  } else if ((facts.sitemapUrlCount ?? 0) === 0) {
    findings.push({
      check: "sitemap_empty",
      label: "Sitemap lists no pages",
      severity: "critical",
      instruction: "List every indexable page in the sitemap. It is currently empty.",
      detail: `${facts.sitemapUrl} contains no page addresses.`,
      fixableByChangeKind: "site.crawl_directives",
    });
  }

  if (facts.pagesMissingFromSitemap.length > 0) {
    findings.push({
      check: "sitemap_coverage_gap",
      label: "Live pages missing from the sitemap",
      severity: "warning",
      instruction: `Add ${facts.pagesMissingFromSitemap.length} live pages to the sitemap so Google stops finding them by accident.`,
      detail: sample(facts.pagesMissingFromSitemap),
      fixableByChangeKind: "site.crawl_directives",
    });
  }

  if (facts.unreadablePages.length > 0) {
    findings.push({
      check: "pages_unreadable",
      label: "Pages that would not render",
      severity: "critical",
      instruction: `Check ${facts.unreadablePages.length} pages that failed to render when read. A crawler sees the same failure.`,
      detail: sample(facts.unreadablePages),
      fixableByChangeKind: null,
    });
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, advice: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function buildSiteHeadline(findings: SiteFinding[], readPages: number): string {
  const worst = findings[0];
  if (!worst) {
    return readPages === 0
      ? "No technical site checks have run yet. Run the audit to read robots.txt, the sitemap and every page."
      : `No site wide crawl defects across ${readPages} read pages.`;
  }
  return `${findings.length} site wide defects. Start here: ${worst.instruction}`;
}
