import { describe, expect, it } from "vitest";

import {
  BACKLINK_RULE_LIMITS,
  checkInboundLinksToErrorPages,
  checkLinkedPagesNeverAudited,
  checkLinkProfileCoveragePartial,
  type AuditedPageRow,
} from "./backlink-rule-checks";

/* -------------------------------------------------------------------- */
/* inbound_link_to_error_page                                            */
/* -------------------------------------------------------------------- */

function errorPageContext(
  overrides: Partial<Parameters<typeof checkInboundLinksToErrorPages>[1]> = {},
) {
  return {
    domainPagesCollectedDate: "2026-08-14",
    siteWideBrokenPages: 7,
    siteWideCollectedDate: "2026-08-14",
    backlinkRows: [] as Record<string, unknown>[],
    ...overrides,
  };
}

describe("inbound_link_to_error_page: a stored 4xx fires with the right reason", () => {
  it("fires on a hard 4xx and claims Google removes the address from its index", () => {
    const drafts = checkInboundLinksToErrorPages(
      [
        {
          page: "https://trumove.com/old-pricing",
          status_code: 404,
          page_summary: { referring_domains: 3 },
          fetch_time: "2026-08-14T00:00:00.000Z",
        },
      ],
      errorPageContext(),
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.target).toBe("https://trumove.com/old-pricing");
    expect(drafts[0]?.description).toMatch(/404/);
    expect(drafts[0]?.description).toMatch(
      /removes an address that answers this way from its index/,
    );
    expect(drafts[0]?.evidence["statusCode"]).toBe(404);
  });

  it("bands 429 and 5xx as a slowdown, never as removal", () => {
    const [rateLimited] = checkInboundLinksToErrorPages(
      [
        {
          page: "https://trumove.com/a",
          status_code: 429,
          page_summary: { referring_domains: 2 },
          fetch_time: "2026-08-14",
        },
      ],
      errorPageContext(),
    );
    expect(rateLimited?.description).toMatch(/slows down crawling/);
    expect(rateLimited?.description).not.toMatch(/removes an address/);

    const [serverError] = checkInboundLinksToErrorPages(
      [
        {
          page: "https://trumove.com/b",
          status_code: 503,
          page_summary: { referring_domains: 2 },
          fetch_time: "2026-08-14",
        },
      ],
      errorPageContext(),
    );
    expect(serverError?.description).toMatch(/slows down crawling/);
    expect(serverError?.description).not.toMatch(/removes an address/);
  });

  it("words 401 and 403 as our crawler being refused, never as proof Google or a visitor sees the same thing", () => {
    const [draft] = checkInboundLinksToErrorPages(
      [
        {
          page: "https://trumove.com/gated",
          status_code: 403,
          page_summary: { referring_domains: 5 },
          fetch_time: "2026-08-14",
        },
      ],
      errorPageContext(),
    );
    expect(draft?.description).toMatch(/refused our crawler/);
    expect(draft?.description).not.toMatch(/removes an address/);
  });

  it("stays silent below 400, and a non-numeric or absent status_code is unknown, not healthy", () => {
    const drafts = checkInboundLinksToErrorPages(
      [
        {
          page: "https://trumove.com/fine",
          status_code: 200,
          page_summary: { referring_domains: 4 },
        },
        { page: "https://trumove.com/missing-code", page_summary: { referring_domains: 4 } },
        {
          page: "https://trumove.com/bad-type",
          status_code: "404",
          page_summary: { referring_domains: 4 },
        },
      ],
      errorPageContext(),
    );
    expect(drafts).toEqual([]);
  });

  it("never prints a coalesced zero: an error page with no stored referring-domain count raises nothing", () => {
    const drafts = checkInboundLinksToErrorPages(
      [{ page: "https://trumove.com/orphaned-error", status_code: 500 }],
      errorPageContext(),
    );
    expect(drafts).toEqual([]);
  });

  it("says the site-wide count is unread rather than printing a stale or invented total", () => {
    const [draft] = checkInboundLinksToErrorPages(
      [
        {
          page: "https://trumove.com/a",
          status_code: 404,
          page_summary: { referring_domains: 1 },
          fetch_time: "2026-08-14",
        },
      ],
      errorPageContext({ siteWideBrokenPages: null, siteWideCollectedDate: null }),
    );
    expect(draft?.description).toMatch(/has not been read yet/);
    expect(draft?.description).not.toMatch(/across your whole site/i);
  });

  it("caps the number of findings filed in one run", () => {
    const rows = Array.from({ length: BACKLINK_RULE_LIMITS.maxFindingsPerRun + 5 }, (_, i) => ({
      page: `https://trumove.com/error-${i}`,
      status_code: 404,
      page_summary: { referring_domains: 1 },
      fetch_time: "2026-08-14",
    }));
    const drafts = checkInboundLinksToErrorPages(rows, errorPageContext());
    expect(drafts).toHaveLength(BACKLINK_RULE_LIMITS.maxFindingsPerRun);
  });
});

/* -------------------------------------------------------------------- */
/* linked_page_never_audited                                             */
/* -------------------------------------------------------------------- */

function reachablePage(page: string) {
  return { page, status_code: 200, media_type: "text/html" };
}

describe("linked_page_never_audited: a set difference between two stored tables", () => {
  it("fires for a linked, reachable page matching no stored observation at all", () => {
    const audited: AuditedPageRow[] = [
      { url: "https://trumove.com/other-page", finalUrl: null, error: null },
    ];
    const drafts = checkLinkedPagesNeverAudited(
      [reachablePage("https://trumove.com/guides/moving-checklist")],
      audited,
      { domainPagesCollectedDate: "2026-08-14" },
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.target).toBe("https://trumove.com/guides/moving-checklist");
    expect(drafts[0]?.description).toMatch(/has not read it/);
  });

  it("with nothing read at all, stays silent rather than calling every linked page unaudited", () => {
    const drafts = checkLinkedPagesNeverAudited(
      [reachablePage("https://trumove.com/guides/moving-checklist")],
      [],
      { domainPagesCollectedDate: "2026-08-14" },
    );
    expect(drafts).toEqual([]);
  });

  it("a linked page with a stored error row raises nothing: it already carries its own named absence", () => {
    const audited: AuditedPageRow[] = [
      {
        url: "https://trumove.com/guides/moving-checklist",
        finalUrl: null,
        error: "fetch failed",
      },
    ];
    const drafts = checkLinkedPagesNeverAudited(
      [reachablePage("https://trumove.com/guides/moving-checklist")],
      audited,
      { domainPagesCollectedDate: "2026-08-14" },
    );
    expect(drafts).toEqual([]);
  });

  it("a linked page matching only a stored final_url (a followed redirect) raises nothing", () => {
    const audited: AuditedPageRow[] = [
      {
        url: "https://trumove.com/old-checklist-url",
        finalUrl: "https://trumove.com/guides/moving-checklist",
        error: null,
      },
    ];
    const drafts = checkLinkedPagesNeverAudited(
      [reachablePage("https://trumove.com/guides/moving-checklist")],
      audited,
      { domainPagesCollectedDate: "2026-08-14" },
    );
    expect(drafts).toEqual([]);
  });

  it("matches regardless of scheme, host case, or a trailing slash", () => {
    const audited: AuditedPageRow[] = [
      { url: "HTTPS://TruMove.com/guides/moving-checklist/", finalUrl: null, error: null },
    ];
    const drafts = checkLinkedPagesNeverAudited(
      [reachablePage("https://trumove.com/guides/moving-checklist")],
      audited,
      { domainPagesCollectedDate: "2026-08-14" },
    );
    expect(drafts).toEqual([]);
  });

  it("ignores a linked address that is not reachable HTML in the backlink index's own reading", () => {
    const audited: AuditedPageRow[] = [
      { url: "https://trumove.com/other-page", finalUrl: null, error: null },
    ];
    const drafts = checkLinkedPagesNeverAudited(
      [
        {
          page: "https://trumove.com/brochure.pdf",
          status_code: 200,
          media_type: "application/pdf",
        },
        { page: "https://trumove.com/gone", status_code: 404, media_type: "text/html" },
      ],
      audited,
      { domainPagesCollectedDate: "2026-08-14" },
    );
    expect(drafts).toEqual([]);
  });

  it("a malformed row (missing page, or a non-numeric status_code) is skipped, never guessed", () => {
    const audited: AuditedPageRow[] = [
      { url: "https://trumove.com/other-page", finalUrl: null, error: null },
    ];
    const drafts = checkLinkedPagesNeverAudited(
      [
        { status_code: 200, media_type: "text/html" },
        { page: "https://trumove.com/bad-status", status_code: "200", media_type: "text/html" },
      ],
      audited,
      { domainPagesCollectedDate: "2026-08-14" },
    );
    expect(drafts).toEqual([]);
  });
});

/* -------------------------------------------------------------------- */
/* link_profile_coverage_partial                                         */
/* -------------------------------------------------------------------- */

describe("link_profile_coverage_partial: names the cap on the referring-domain list", () => {
  it("fires when the newest referring-domains snapshot is at its own row cap", () => {
    const drafts = checkLinkProfileCoveragePartial({
      target: "trumove.com",
      referringDomainLimit: 200,
      snapshots: [
        { reportingDate: "2026-08-14", returnedRowCount: 200, totalCount: 412 },
        { reportingDate: "2026-07-14", returnedRowCount: 180, totalCount: 390 },
      ],
      summaryReferringDomains: null,
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.target).toBe("trumove.com");
    expect(drafts[0]?.description).toMatch(/412 sites linking here/);
    expect(drafts[0]?.description).toMatch(/holds the 200/);
  });

  it("fires when only the older of the two diffed snapshots was capped", () => {
    const drafts = checkLinkProfileCoveragePartial({
      target: "trumove.com",
      referringDomainLimit: 200,
      snapshots: [
        { reportingDate: "2026-08-14", returnedRowCount: 150, totalCount: 150 },
        { reportingDate: "2026-07-14", returnedRowCount: 200, totalCount: 260 },
      ],
      summaryReferringDomains: null,
    });
    expect(drafts).toHaveLength(1);
  });

  it("falls back to the backlinks_summary total only when the snapshot's own total is missing", () => {
    const drafts = checkLinkProfileCoveragePartial({
      target: "trumove.com",
      referringDomainLimit: 200,
      snapshots: [{ reportingDate: "2026-08-14", returnedRowCount: 200, totalCount: null }],
      summaryReferringDomains: 500,
    });
    expect(drafts[0]?.description).toMatch(/500 sites linking here/);
  });

  it("says the list is capped without naming a total when neither total is known", () => {
    const drafts = checkLinkProfileCoveragePartial({
      target: "trumove.com",
      referringDomainLimit: 200,
      snapshots: [{ reportingDate: "2026-08-14", returnedRowCount: 200, totalCount: null }],
      summaryReferringDomains: null,
    });
    expect(drafts[0]?.description).toMatch(/has not been read/);
    expect(drafts[0]?.description).not.toMatch(/\d+ sites linking here/);
  });

  it("stays silent when the stored list is not at its cap, even if the total is far larger", () => {
    const drafts = checkLinkProfileCoveragePartial({
      target: "trumove.com",
      referringDomainLimit: 200,
      snapshots: [{ reportingDate: "2026-08-14", returnedRowCount: 40, totalCount: 412 }],
      summaryReferringDomains: null,
    });
    expect(drafts).toEqual([]);
  });

  it("stays silent when there is no stored referring-domains snapshot at all", () => {
    const drafts = checkLinkProfileCoveragePartial({
      target: "trumove.com",
      referringDomainLimit: 200,
      snapshots: [],
      summaryReferringDomains: 500,
    });
    expect(drafts).toEqual([]);
  });

  it("never writes 200 into the copy: it renders the stored row count", () => {
    const drafts = checkLinkProfileCoveragePartial({
      target: "trumove.com",
      referringDomainLimit: 250,
      snapshots: [{ reportingDate: "2026-08-14", returnedRowCount: 250, totalCount: 300 }],
      summaryReferringDomains: null,
    });
    expect(drafts[0]?.description).toMatch(/holds the 250/);
    expect(drafts[0]?.title).toMatch(/top 250/);
  });
});
