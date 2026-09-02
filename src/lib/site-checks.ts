/**
 * Pure site wide technical checks. These sit above the per page checks in
 * page-checks.ts: they read what the whole site tells a crawler through
 * robots.txt and the sitemap, and how much of the site the audit actually
 * managed to read. Nothing here fetches, guesses, or estimates.
 */

import type { SiteLicenceFacts } from "./broker-licence";
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
  | "pages_unreadable"
  | "http_not_redirected"
  | "hsts_missing"
  | "security_headers_missing"
  | "host_not_consolidated"
  | "mixed_content_present"
  | "homepage_slow_to_respond"
  | "broker_numbers_missing"
  | "broker_numbers_disagree"
  | "broker_statement_missing"
  | "broker_numbers_off_homepage";

/**
 * What the site answered at the protocol layer, read directly by the audit
 * without following redirects, so the answer is the server's own and not the
 * one a browser would have been steered to (CODE-25).
 */
export type ProtocolFacts = {
  /** What plain http:// at the origin answered. */
  httpStatus: number | null;
  httpLocation: string | null;
  /** The https homepage. */
  httpsStatus: number | null;
  /** Milliseconds until the response headers arrived: one server-side sample. */
  ttfbMs: number | null;
  htmlBytes: number | null;
  strictTransportSecurity: string | null;
  contentSecurityPolicy: string | null;
  xContentTypeOptions: string | null;
  /** The other spelling of the host (www or apex) and what it answered. */
  alternateHost: string;
  alternateStatus: number | null;
  alternateLocation: string | null;
  /** http:// resources the homepage HTML loads through a src attribute. */
  mixedContentUrls: string[];
};

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
  /** Absent on snapshots stored before the protocol read existed. */
  protocol?: ProtocolFacts;
  /** Absent on snapshots stored before the broker registration read existed. */
  licence?: SiteLicenceFacts;
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
  const findings: SiteFinding[] = facts.protocol
    ? evaluateProtocol(facts.origin, facts.protocol)
    : [];

  // robots.txt intro doc: "A robots.txt file tells search engine crawlers
  // which URLs the crawler can access on your site."
  // https://developers.google.com/search/docs/crawling-indexing/robots/intro
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
    // robots_txt reference: "Disallow: /" under "User-agent: *" — "/"
    // "Matches the root and any lower level URL," so this rule blocks
    // every crawler from every page.
    // https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
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
      // robots.txt intro doc: robots.txt "tells search engine crawlers
      // which URLs the crawler can access." A page declared indexable but
      // disallowed here is the site contradicting itself in two files.
      // https://developers.google.com/search/docs/crawling-indexing/robots/intro
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

  // Sitemaps overview: "Search engines like Google read this file to crawl
  // your site more efficiently," particularly because "Googlebot might not
  // discover your pages if no other sites link to them."
  // https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
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

  // Sitemaps overview: a sitemap gives Google "information about the
  // pages, videos, and other files on your site, and the relationships
  // between them" — the same doc as above.
  // https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
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
    // Sitemaps overview: same doc as above — a sitemap that returns an
    // error can't tell Google anything about the site's pages.
    // https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
    findings.push({
      check: "sitemap_unreachable",
      label: "Sitemap cannot be read",
      severity: "critical",
      instruction: "Fix the sitemap address so crawlers can read it.",
      detail: `${facts.sitemapUrl} returned HTTP ${facts.sitemapStatus}.`,
      fixableByChangeKind: "site.crawl_directives",
    });
  } else if ((facts.sitemapUrlCount ?? 0) === 0) {
    // Sitemaps overview: same doc as above — an empty sitemap gives Google
    // no page addresses to read.
    // https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
    findings.push({
      check: "sitemap_empty",
      label: "Sitemap lists no pages",
      severity: "critical",
      instruction: "List every indexable page in the sitemap. It is currently empty.",
      detail: `${facts.sitemapUrl} contains no page addresses.`,
      fixableByChangeKind: "site.crawl_directives",
    });
  }

  // Sitemaps overview: "Googlebot might not discover your pages if no
  // other sites link to them" — a live page absent from the sitemap is
  // relying on that discovery instead of declaring itself.
  // https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
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

  // Stated assumption: no single Google doc states "a crawler sees the
  // same failure a renderer does" as a blanket rule; kept as a reasonable
  // inference from Google's own rendering-based indexing.
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

  if (facts.licence) findings.push(...evaluateLicence(facts.licence));

  const order: Record<Severity, number> = { critical: 0, warning: 1, advice: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

const PARAGRAPH_B =
  '49 CFR 371.107(b): "You must prominently display your U.S. DOT registration number(s) and MC license number issued by the FMCSA in your advertisements and Internet Web homepage(s)."';
const PARAGRAPH_C =
  '49 CFR 371.107(c): "You must prominently display in your advertisements and Internet website(s) your status as a household goods broker and the statement that you will not transport an individual shipper\'s household goods, but that you will arrange for the transportation of the household goods by an FMCSA-authorized household goods motor carrier, whose charges will be determined by its published tariff."';

/**
 * What the homepage shows of the broker's federal registration, against
 * 49 CFR 371.107 paragraphs (b) and (c) as quoted in broker-licence.ts
 * (CODE-86). A homepage the audit did not read raises nothing: an absent
 * reading is not a missing number. Paragraph (a), the street address, is not
 * checked because it cannot be read without guessing. Every finding is a
 * wording change on the website, which AOOS does not edit, so none carries a
 * governed fix.
 */
function evaluateLicence(facts: SiteLicenceFacts): SiteFinding[] {
  const findings: SiteFinding[] = [];
  const home = facts.homepage;
  const url = facts.homepageUrl;
  if (home === null || url === null) return findings;
  const coverage = `${facts.pagesShowingBothNumbers} of ${facts.pagesRead} read pages show both numbers.`;

  const missing = [
    ...(home.usdotNumbers.length === 0 ? ["USDOT number"] : []),
    ...(home.mcNumbers.length === 0 ? ["MC number"] : []),
  ];
  if (missing.length > 0) {
    findings.push({
      check: "broker_numbers_missing",
      label: "The homepage does not show the broker's registration numbers",
      severity: "warning",
      instruction: `Show the USDOT number and the MC number in the homepage text. ${PARAGRAPH_B}`,
      detail: `The visible text of ${url} holds no ${missing.join(" and no ")}. ${coverage}`,
      fixableByChangeKind: null,
    });
  }

  const disagreeing = [
    ...(home.usdotNumbers.length > 1 ? [`USDOT ${home.usdotNumbers.join(" and ")}`] : []),
    ...(home.mcNumbers.length > 1 ? [`MC ${home.mcNumbers.join(" and ")}`] : []),
  ];
  if (disagreeing.length > 0) {
    findings.push({
      check: "broker_numbers_disagree",
      label: "The homepage shows more than one number under one registration label",
      severity: "warning",
      instruction:
        "Keep one USDOT number and one MC number on the homepage, the ones FMCSA issued to this broker, and remove any other.",
      detail: `${url} shows ${disagreeing.join("; ")}. ${PARAGRAPH_B}`,
      fixableByChangeKind: null,
    });
  }

  const absentWords = [
    ...(home.statement.notTransport ? [] : ['"not transport"']),
    ...(home.statement.arrange ? [] : ['"arrange"']),
    ...(home.statement.tariff ? [] : ['"tariff"']),
  ];
  if (!home.brokerStatusShown || absentWords.length > 0) {
    const parts = [
      ...(home.brokerStatusShown ? [] : ['the words "household goods broker"']),
      ...(absentWords.length > 0 ? [`the statement's ${absentWords.join(", ")}`] : []),
    ];
    findings.push({
      check: "broker_statement_missing",
      label: "The homepage does not carry the broker statement in full",
      severity: "warning",
      instruction: `State on the homepage that this is a household goods broker that will not transport the goods but will arrange a carrier whose charges follow its published tariff. ${PARAGRAPH_C}`,
      detail: `The visible text of ${url} lacks ${parts.join(" and ")}. The statement is read as three words, "not transport", "arrange" and "tariff", so wording that says the same thing differently reads as absent.`,
      fixableByChangeKind: null,
    });
  }

  // A page other than the homepage carrying a registration number the homepage
  // does not (CODE-88, found by reading the live site). Reported as the fact it
  // is and nothing more: the number may belong to a carrier shown in a demo,
  // which paragraph (e) of the same section governs, or it may be a stale
  // number of the operator's own. Which of those it is, only the operator
  // knows, so no breach is asserted here.
  const others = facts.pagesWithOtherNumbers ?? [];
  if (others.length > 0) {
    const named = others
      .slice(0, 3)
      .map((page) => {
        const parts = [
          ...(page.usdotNumbers.length > 0 ? [`USDOT ${page.usdotNumbers.join(", ")}`] : []),
          ...(page.mcNumbers.length > 0 ? [`MC ${page.mcNumbers.join(", ")}`] : []),
        ];
        return `${page.url} shows ${parts.join(" and ")}`;
      })
      .join("; ");
    findings.push({
      check: "broker_numbers_off_homepage",
      label: "Another page shows a registration number your homepage does not",
      severity: "advice",
      instruction:
        "Check whether each of these belongs to you or to a carrier you are naming, and that it is current. Where it names a carrier, 49 CFR 371.107(e) allows only carriers you hold a written agreement with.",
      detail: `${named}${others.length > 3 ? `, and ${others.length - 3} more page(s)` : ""}. Read directly from the pages, not inferred. Whether each is correct is yours to say; nothing here claims otherwise.`,
      fixableByChangeKind: null,
    });
  }

  return findings;
}

/**
 * web.dev, "Time to First Byte (TTFB)": "a good TTFB is 0.8 seconds or less".
 * One server-side sample, so a slow reading is reported as a single read,
 * never as a field measurement.
 */
export const TTFB_GOOD_MS = 800;

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function redirectsToHttps(facts: ProtocolFacts): boolean {
  return (
    facts.httpStatus !== null &&
    facts.httpStatus >= 300 &&
    facts.httpStatus < 400 &&
    typeof facts.httpLocation === "string" &&
    facts.httpLocation.toLowerCase().startsWith("https://")
  );
}

/**
 * The protocol layer under the crawl directives: HTTPS enforcement, HSTS, the
 * browser-hardening headers, one host spelling, mixed content, and the time
 * to first byte. Each finding cites the sentence it rests on; every one is a
 * server change, so none carries a governed fix.
 */
function evaluateProtocol(origin: string, facts: ProtocolFacts): SiteFinding[] {
  const findings: SiteFinding[] = [];
  const canonicalHost = hostOf(origin);

  // Google, "Secure your site with HTTPS": "Redirect your users and search
  // engines to the HTTPS page or resource with server-side 301 HTTP redirects."
  // https://developers.google.com/search/docs/crawling-indexing/site-security/https
  if (facts.httpStatus !== null && !redirectsToHttps(facts)) {
    findings.push({
      check: "http_not_redirected",
      label: "Plain HTTP is not redirected to HTTPS",
      severity: "warning",
      instruction:
        "Redirect every http:// address to its https:// address with a 301 at the server.",
      detail:
        facts.httpStatus >= 300 && facts.httpStatus < 400
          ? `http://${canonicalHost ?? origin}/ answered HTTP ${facts.httpStatus} to ${facts.httpLocation ?? "no Location"}, not to https://.`
          : `http://${canonicalHost ?? origin}/ answered HTTP ${facts.httpStatus} and served instead of redirecting.`,
      fixableByChangeKind: null,
    });
  }

  if (facts.httpsStatus !== null) {
    // Same document: "Consider using HSTS. HSTS tells the browser to request
    // HTTPS pages automatically, even if the user enters http in the browser
    // location bar."
    if (facts.strictTransportSecurity === null) {
      findings.push({
        check: "hsts_missing",
        label: "No HSTS header",
        severity: "warning",
        instruction:
          "Send a Strict-Transport-Security header so browsers ask for HTTPS on their own.",
        detail: `${origin}/ answered HTTP ${facts.httpsStatus} with no Strict-Transport-Security header.`,
        fixableByChangeKind: null,
      });
    }

    // Not a search signal. Lighthouse's best-practices audits check both;
    // reported as advice so the operator can decide, never as a ranking claim.
    const missing = [
      ...(facts.contentSecurityPolicy === null ? ["Content-Security-Policy"] : []),
      ...(facts.xContentTypeOptions === null ? ["X-Content-Type-Options"] : []),
    ];
    if (missing.length > 0) {
      findings.push({
        check: "security_headers_missing",
        label: "Browser hardening headers are missing",
        severity: "advice",
        instruction: `Send ${missing.join(" and ")} from the server. This is browser hardening, not a ranking signal.`,
        detail: `${origin}/ answered without ${missing.join(" or ")}.`,
        fixableByChangeKind: null,
      });
    }

    // web.dev, "Time to First Byte (TTFB)": "a good TTFB is 0.8 seconds or less".
    if (facts.ttfbMs !== null && facts.ttfbMs > TTFB_GOOD_MS) {
      findings.push({
        check: "homepage_slow_to_respond",
        label: "The homepage was slow to start responding",
        severity: "warning",
        instruction:
          "Find out why the server takes this long to send its first byte; caching or the host itself are the usual causes.",
        detail: `${origin}/ took ${facts.ttfbMs} ms to first byte on one server-side read; web.dev calls 800 ms or less good. One sample, not a field measurement.`,
        fixableByChangeKind: null,
      });
    }
  }

  // Google, "Consolidate duplicate URLs": pick one canonical URL and "use 301
  // redirects" from the other spellings to it.
  // https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
  if (facts.alternateStatus !== null && canonicalHost) {
    const redirectedHome =
      facts.alternateStatus >= 300 &&
      facts.alternateStatus < 400 &&
      hostOf(facts.alternateLocation ?? "") === canonicalHost;
    if (!redirectedHome) {
      findings.push({
        check: "host_not_consolidated",
        label: "Two spellings of the host both answer",
        severity: "warning",
        instruction: `Redirect https://${facts.alternateHost}/ to https://${canonicalHost}/ with a 301 so Google sees one site.`,
        detail:
          facts.alternateStatus >= 300 && facts.alternateStatus < 400
            ? `https://${facts.alternateHost}/ answered HTTP ${facts.alternateStatus} to ${facts.alternateLocation ?? "no Location"}, not to ${canonicalHost}.`
            : `https://${facts.alternateHost}/ answered HTTP ${facts.alternateStatus} and served its own page.`,
        fixableByChangeKind: null,
      });
    }
  }

  // Google, "Secure your site with HTTPS": "Avoid mixed content".
  if (facts.mixedContentUrls.length > 0) {
    findings.push({
      check: "mixed_content_present",
      label: "The homepage loads resources over plain HTTP",
      severity: "warning",
      instruction:
        "Load every script, image and frame over https:// so browsers do not block or warn.",
      detail: `${facts.mixedContentUrls.length} http:// resource(s) on ${origin}/, for example ${sample(facts.mixedContentUrls)}.`,
      fixableByChangeKind: null,
    });
  }

  return findings;
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
