import type { Database } from "@/integrations/supabase/types";

/**
 * Pure rule checks over already-stored DataForSEO Backlinks rows. Kept out of
 * the .server module so they test without mocks, matching
 * pagespeed-rule-checks.ts and search-console-rule-checks.ts. Nothing here
 * reads a network or a database; the .server caller supplies rows already
 * read from `dataforseo_snapshots` and `page_metadata_observations`.
 *
 * Six Backlinks endpoints are collected; only `referring_domain_movement`
 * (dataforseo/targeting-rules.server.ts) reads any of them. These three rules
 * read three more: `backlinks_domain_pages`, `backlinks_backlinks`,
 * `backlinks_summary`, and the two most recent `backlinks_referring_domains`
 * snapshots. `collectBacklinkHistory` is deliberately not read here: it does
 * not store per-month rows in a shape any rule can trust yet
 * (docs/handoffs/2026-08-28-parallel-rule-sessions.md, Session B — this is
 * why `net_link_loss_last_month` and `referring_domain_year_movement` were
 * killed rather than implemented).
 *
 * Stated assumption: the item-level field names read below (`page`,
 * `status_code`, `page_summary.referring_domains`, `fetch_time`,
 * `media_type` on a `backlinks_domain_pages` row; `url_to`, `domain_from`,
 * `url_from` on a `backlinks_backlinks` row) come from the adversarial review
 * that produced the handoff above, not from a live response this repo has
 * diffed a fixture against — docs/integrations/dataforseo/DIGEST.md documents
 * the endpoints but not their item shape. Every read below is defensive: an
 * absent or wrong-typed field drops that row or that evidence line rather
 * than inventing a value. Diff the first real snapshot against this shape
 * before trusting it completely, the same caveat onpage.test.ts:100 states
 * for the OnPage side.
 */

export type BacklinkCheckRule =
  "inbound_link_to_error_page" | "linked_page_never_audited" | "link_profile_coverage_partial";

export type BacklinkObservationDraft = {
  rule: BacklinkCheckRule;
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: Database["public"]["Enums"]["impact_level"];
  confidence: number;
};

/**
 * Not a threshold about the site: a queue-size cap on how many cards one run
 * files, the same role `PAGESPEED_RULE_THRESHOLDS.maxFindingsPerRun` plays.
 */
export const BACKLINK_RULE_LIMITS = { maxFindingsPerRun: 10 } as const;

type Row = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nested(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : null;
}

/**
 * Scheme, host case, fragment and a trailing slash are cosmetic differences
 * that would otherwise make a redirect target read as a different page than
 * the one linked. `URL` throws on a relative or malformed string, in which
 * case the best available comparison is a trimmed, lower-cased literal.
 */
function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    const host = url.hostname.toLowerCase();
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${host}${path}${url.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/* -------------------------------------------------------------------- */
/* inbound_link_to_error_page                                            */
/* -------------------------------------------------------------------- */

export type ErrorPageContext = {
  /** reporting_date of the backlinks_domain_pages snapshot read. */
  domainPagesCollectedDate: string;
  /** totals.broken_pages from the newest backlinks_summary snapshot, or null when unread. */
  siteWideBrokenPages: number | null;
  /** reporting_date of that summary snapshot, or null when there is none. */
  siteWideCollectedDate: string | null;
  /** Raw backlinks_backlinks rows, matched to a linked page by url_to. */
  backlinkRows: readonly Row[];
};

/**
 * Google, HTTP status codes and network errors
 * (https://developers.google.com/search/docs/crawling-indexing/http-network-errors,
 * fetched 2026-08-28):
 *
 * "All 4xx errors, except 429, are treated the same: Google crawlers inform
 * the next processing system that the content doesn't exist."
 *
 * "5xx and 429 server errors prompt Google's crawlers to temporarily slow
 * down with crawling. For Google Search, already indexed URLs are preserved
 * in the index, but eventually dropped."
 *
 * 400 is not a tuned number: it is RFC 9110's 4xx/5xx class boundary. This
 * splits on that quoted distinction rather than treating every stored error
 * the same, and for 401/403 does not assert removal at all: bot protection
 * commonly answers an automated crawler with one of those and a visitor with
 * 200, so a stored 401/403 says our crawler was refused, not that Google or a
 * visitor sees the same thing.
 */
function describeError(statusCode: number, dateWord: string): string {
  if (statusCode === 401 || statusCode === 403) {
    return (
      `${dateWord} it refused our crawler with a ${statusCode} response. Sites sometimes answer ` +
      `an automated crawler differently than a visitor, so this does not by itself say what a ` +
      `visitor or Google sees there.`
    );
  }
  if (statusCode === 429 || (statusCode >= 500 && statusCode <= 599)) {
    return (
      `${dateWord} the server was failing when we last fetched it, answering with a ${statusCode}. ` +
      `Google slows down crawling a page that keeps answering this way and eventually drops it from ` +
      `its index if the failures continue, rather than removing it right away.`
    );
  }
  return (
    `${dateWord} it answered with a ${statusCode} error instead of a page, so anyone following ` +
    `those links from other sites lands on nothing there right now. Google removes an address ` +
    `that answers this way from its index.`
  );
}

function pluralSites(count: number): string {
  return count === 1 ? "1 site links" : `${count} sites link`;
}

/**
 * One linked page of ours that answers with an error, for every row the
 * newest `backlinks_domain_pages` snapshot can actually read.
 *
 * `status_code` missing or non-numeric means "not crawled": unknown, never
 * healthy, so that row is skipped rather than counted as fine.
 * `page_summary.referring_domains` absent is a silent gate, never a printed
 * "0 sites" — the whole row is skipped without inventing a count.
 */
export function checkInboundLinksToErrorPages(
  rows: readonly Row[],
  context: ErrorPageContext,
): BacklinkObservationDraft[] {
  const linksByPage = new Map<string, { domainFrom: string; urlFrom: string }[]>();
  for (const row of context.backlinkRows) {
    const urlTo = str(row["url_to"]);
    const domainFrom = str(row["domain_from"]);
    const urlFrom = str(row["url_from"]);
    if (urlTo === null || domainFrom === null || urlFrom === null) continue;
    const key = normalizeUrl(urlTo);
    const existing = linksByPage.get(key) ?? [];
    existing.push({ domainFrom, urlFrom });
    linksByPage.set(key, existing);
  }

  const drafts: BacklinkObservationDraft[] = [];

  for (const row of rows) {
    const statusCode = num(row["status_code"]);
    if (statusCode === null || statusCode < 400) continue;

    const page = str(row["page"]);
    if (page === null) continue;

    const summary = nested(row["page_summary"]);
    const referringDomains = summary === null ? null : num(summary["referring_domains"]);
    // Silent gate: absence never prints as "0 sites".
    if (referringDomains === null || referringDomains <= 0) continue;

    const fetchTime = str(row["fetch_time"]);
    const dateWord = fetchTime
      ? `When our link crawler last fetched it on ${fetchTime.slice(0, 10)},`
      : "The last time our link crawler fetched it,";

    const siteWideClause =
      context.siteWideBrokenPages === null
        ? "The site-wide count of linked pages answering with an error has not been read yet."
        : `Across your whole site ${context.siteWideBrokenPages} linked page${
            context.siteWideBrokenPages === 1 ? "" : "s"
          } answer${context.siteWideBrokenPages === 1 ? "s" : ""} with an error${
            context.siteWideCollectedDate !== null &&
            context.siteWideCollectedDate !== context.domainPagesCollectedDate
              ? ` as of ${context.siteWideCollectedDate}`
              : ""
          }, of which this reading names the ones in the stored sample read on ${context.domainPagesCollectedDate}.`;

    const evidenceLinks = (linksByPage.get(normalizeUrl(page)) ?? []).slice(0, 3);

    drafts.push({
      rule: "inbound_link_to_error_page",
      target: page,
      title: `Other sites link to a page that answers with an error`,
      description:
        `Other sites link to ${page}. ${describeError(statusCode, dateWord)} ` +
        `${pluralSites(referringDomains)} to it in the stored sample. ${siteWideClause}`,
      evidence: {
        page,
        statusCode,
        referringDomainsToPage: referringDomains,
        fetchTime,
        domainPagesCollectedDate: context.domainPagesCollectedDate,
        siteWideBrokenPages: context.siteWideBrokenPages,
        siteWideCollectedDate: context.siteWideCollectedDate,
        sampleLinks: evidenceLinks,
      },
      businessImpact: "medium",
      confidence: 1,
    });
  }

  return drafts.slice(0, BACKLINK_RULE_LIMITS.maxFindingsPerRun);
}

/* -------------------------------------------------------------------- */
/* linked_page_never_audited                                             */
/* -------------------------------------------------------------------- */

export type AuditedPageRow = {
  url: string;
  finalUrl: string | null;
  /** Non-null means the audit attempted this page and could not read it. */
  error: string | null;
};

export type NeverAuditedContext = {
  /** reporting_date of the backlinks_domain_pages snapshot read. */
  domainPagesCollectedDate: string;
};

/**
 * Other sites' links to pages of ours the page audit has never read.
 *
 * With no stored audit observation at all, every linked page would look
 * unaudited, which is a statement about the audit, not the site — the same
 * guard `detectKeywordsWithoutPage` uses (targeting-rules.ts:84-85). A linked
 * page whose latest observation carries an `error` has already been read and
 * already carries its own named absence, so it must not fire this rule
 * either: only a page matching no stored observation at all — by `url` or by
 * `final_url`, after normalizing — counts as never audited.
 *
 * Only rows the backlink index recorded as reachable HTML (`status_code`
 * 200, `media_type` "text/html") are considered: a linked PDF or a dead
 * address is real, but "nothing is stored about what is on it" misdescribes
 * it.
 */
export function checkLinkedPagesNeverAudited(
  domainPageRows: readonly Row[],
  auditedPages: readonly AuditedPageRow[],
  context: NeverAuditedContext,
): BacklinkObservationDraft[] {
  if (auditedPages.length === 0) return [];

  const read = new Set<string>();
  const attemptedUnreadable = new Set<string>();
  for (const observed of auditedPages) {
    const urls = [observed.url, observed.finalUrl].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    const bucket = observed.error === null ? read : attemptedUnreadable;
    for (const url of urls) bucket.add(normalizeUrl(url));
  }

  const candidates: string[] = [];
  for (const row of domainPageRows) {
    const page = str(row["page"]);
    if (page === null) continue;
    const statusCode = num(row["status_code"]);
    const mediaType = str(row["media_type"]);
    if (statusCode !== 200 || mediaType !== "text/html") continue;

    const normalized = normalizeUrl(page);
    if (read.has(normalized) || attemptedUnreadable.has(normalized)) continue;
    candidates.push(page);
  }

  const totalFound = candidates.length;
  if (totalFound === 0) return [];

  const countClause =
    totalFound > BACKLINK_RULE_LIMITS.maxFindingsPerRun
      ? ` This run found ${totalFound} linked pages like this; this is one of them.`
      : totalFound > 1
        ? ` This run found ${totalFound} linked pages like this.`
        : "";

  return [...candidates]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, BACKLINK_RULE_LIMITS.maxFindingsPerRun)
    .map((page) => ({
      rule: "linked_page_never_audited" as const,
      target: page,
      title: `Other sites link to a page the audit has never read`,
      description:
        `Other sites link to ${page}, and the page audit has not read it, so nothing is stored ` +
        `about what is on it. Each run of the page audit reads up to 100 pages built from your ` +
        `sitemap and what Google Search Console has reported, so this address may not be on ` +
        `either list yet, or may simply not have been reached this run.${countClause}`,
      evidence: {
        page,
        domainPagesCollectedDate: context.domainPagesCollectedDate,
        totalUnauditedLinkedPagesFound: totalFound,
      },
      businessImpact: "medium",
      confidence: 1,
    }));
}

/* -------------------------------------------------------------------- */
/* link_profile_coverage_partial                                         */
/* -------------------------------------------------------------------- */

export type ReferringDomainsSnapshotFacts = {
  reportingDate: string;
  returnedRowCount: number;
  /** totals.totalCount on this same snapshot, or null when the provider omitted it. */
  totalCount: number | null;
};

export type LinkProfileCoverageContext = {
  /** The bare domain the Backlinks calls were made for. Stable across collections. */
  target: string;
  /** BACKLINKS_CONFIG.referringDomainLimit, never copied by hand. */
  referringDomainLimit: number;
  /** The snapshots `referring_domain_movement` diffs: current and prior, either may be absent. */
  snapshots: readonly (ReferringDomainsSnapshotFacts | null)[];
  /** totals.referring_domains from the newest backlinks_summary snapshot, a fallback total only. */
  summaryReferringDomains: number | null;
};

/**
 * Whether the referring-domain list `referring_domain_movement` diffs is a
 * complete read of the property's referring domains, or the top slice of a
 * longer one.
 *
 * Fires on the referring-domains snapshot itself being at its own row cap —
 * the same test that sets `possibly_truncated` on that snapshot
 * (backlinks.server.ts:91), and meaningful there because that call alone
 * sends a `limit`; `backlinks_summary` and `backlinks_history` do not, so
 * their own `possibly_truncated` is not read here. Checks both snapshots the
 * movement rule diffs, not only the newest, since either being capped means
 * the diff cannot see past it.
 */
export function checkLinkProfileCoveragePartial(
  context: LinkProfileCoverageContext,
): BacklinkObservationDraft[] {
  const capped = context.snapshots.find(
    (snapshot): snapshot is ReferringDomainsSnapshotFacts =>
      snapshot !== null && snapshot.returnedRowCount >= context.referringDomainLimit,
  );
  if (capped === undefined) return [];

  const total = capped.totalCount ?? context.summaryReferringDomains;

  const description =
    total !== null
      ? `The link data we buy counts ${total} sites linking here, and the stored list holds the ` +
        `${capped.returnedRowCount} that source scores highest, so the check of which sites came ` +
        `and went covers those ${capped.returnedRowCount} and not the rest.`
      : `The stored list of sites linking here is capped at ${capped.returnedRowCount}, the most ` +
        `this source returns in one read, so the check of which sites came and went covers only ` +
        `those and not the rest. How many more exist has not been read.`;

  return [
    {
      rule: "link_profile_coverage_partial",
      target: context.target,
      title: `The link movement check only covers your top ${capped.returnedRowCount} linking sites`,
      description,
      evidence: {
        cappedReportingDate: capped.reportingDate,
        storedRowCount: capped.returnedRowCount,
        referringDomainLimit: context.referringDomainLimit,
        totalReferringDomains: total,
      },
      businessImpact: "low",
      confidence: 1,
    },
  ];
}
