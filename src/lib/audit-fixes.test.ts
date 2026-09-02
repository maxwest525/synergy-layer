import { describe, expect, it } from "vitest";

import {
  buildCrawlDirectiveFix,
  fixTargetForPage,
  fixTargetForPageCheck,
  buildBrokerStatementFix,
  fixTargetForSiteCheck,
  noFixReasonForPage,
} from "./audit-fixes";

const SITEMAP = "Sitemap: https://example.com/sitemap.xml";

function unblock(robotsContent: string, blockedPaths: string[]) {
  return buildCrawlDirectiveFix({
    check: "robots_blocks_pages",
    robotsContent,
    sitemapUrl: "https://example.com/sitemap.xml",
    blockedPaths,
  });
}

describe("the fix for pages robots.txt hides from the sitemap", () => {
  it("is offered at all, because the sitemap already says which way to resolve it", () => {
    // The finding only fires for pages the sitemap declares, so the owner has
    // already stated they want them indexed. That is not an ambiguity.
    expect(fixTargetForSiteCheck("robots_blocks_pages")?.changeKind).toBe("site.crawl_directives");
  });

  it("empties the one rule that accounts for every blocked page", () => {
    const robots = `User-agent: *\nDisallow: /services/\nDisallow: /wp-admin/\n${SITEMAP}`;
    const fix = unblock(robots, ["/services/packing", "/services/storage"]);
    expect("error" in fix).toBe(false);
    if ("error" in fix) return;
    expect(fix.changes).toHaveLength(1);
    expect(fix.changes[0]?.before).toBe("Disallow: /services/");
    // Emptied, not deleted: a bare Disallow means allow everything, and the
    // executor matches an exact literal, so removing the line would shift
    // every line under it.
    expect(fix.changes[0]?.after).toBe("Disallow:");
  });

  it("leaves the rules that were not the problem alone", () => {
    const robots = `User-agent: *\nDisallow: /services/\nDisallow: /wp-admin/\n${SITEMAP}`;
    const fix = unblock(robots, ["/services/packing"]);
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.changes[0]?.before).not.toContain("wp-admin");
  });

  it("refuses when several rules are involved, and names them", () => {
    // Removing them one at a time is a decision about which pages should stay
    // private, not one obvious correction.
    const robots = `User-agent: *\nDisallow: /services/\nDisallow: /storage/\n${SITEMAP}`;
    const fix = unblock(robots, ["/services/packing", "/storage/units"]);
    expect("error" in fix).toBe(true);
    if (!("error" in fix)) return;
    expect(fix.error).toContain("/services/");
    expect(fix.error).toContain("/storage/");
  });

  it("refuses a rule that would only be half the fix", () => {
    const robots = `User-agent: *\nDisallow: /services/\nDisallow: /storage/units$\n${SITEMAP}`;
    const fix = unblock(robots, ["/services/packing", "/storage/units"]);
    expect("error" in fix).toBe(true);
  });

  it("refuses when two overlapping rules both hide the same page", () => {
    // Emptying either one leaves the other, so neither is the fix.
    const robots = `User-agent: *\nDisallow: /a/\nDisallow: /a/b/\n${SITEMAP}`;
    const fix = unblock(robots, ["/a/b/c"]);
    expect("error" in fix && fix.error).toMatch(/no single Disallow|separate rules/i);
  });

  it("refuses when the governed file does not block these pages at all", () => {
    // The finding read the live robots.txt; this reads the repository. They
    // drift, and acting on a stale finding would edit a file for no reason.
    const robots = `User-agent: *\nDisallow: /nothing-relevant/\n${SITEMAP}`;
    const fix = unblock(robots, ["/services/packing"]);
    expect("error" in fix && fix.error).toMatch(/does not block these pages/i);
  });

  it("refuses when the finding carried no addresses", () => {
    const fix = unblock(`User-agent: *\nDisallow: /a/\n${SITEMAP}`, []);
    expect("error" in fix && fix.error).toMatch(/no blocked page addresses/i);
  });

  it("resolves precedence through the matcher rather than by reading rule text", () => {
    // An Allow carve-out means this page was never blocked, so there is nothing
    // to change however much the rule text looks like it matches.
    const robots = `User-agent: *\nDisallow: /services/\nAllow: /services/packing\n${SITEMAP}`;
    expect("error" in unblock(robots, ["/services/packing"])).toBe(true);
    // Its sibling is genuinely blocked by the same rule, and that is fixable.
    const fix = unblock(robots, ["/services/storage"]);
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.changes[0]?.before).toBe("Disallow: /services/");
  });

  it("honours the crawler the finding was measured for", () => {
    const robots = `User-agent: *\nAllow: /\n\nUser-agent: Bingbot\nDisallow: /services/\n${SITEMAP}`;
    // Googlebot is not governed by the Bingbot group, so nothing is blocked.
    expect("error" in unblock(robots, ["/services/packing"])).toBe(true);
    const forBing = buildCrawlDirectiveFix({
      check: "robots_blocks_pages",
      robotsContent: robots,
      sitemapUrl: null,
      blockedPaths: ["/services/packing"],
      userAgent: "Bingbot",
    });
    if ("error" in forBing) throw new Error(forBing.error);
    expect(forBing.changes[0]?.before).toBe("Disallow: /services/");
  });

  it("explains itself in terms of the contradiction, not the rule syntax", () => {
    const fix = unblock(`User-agent: *\nDisallow: /services/\n${SITEMAP}`, ["/services/packing"]);
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.rationale).toMatch(/sitemap/i);
    expect(fix.rationale).toContain("/services/");
  });
});

describe("the fixes that were already here", () => {
  it("still removes a site wide block", () => {
    const fix = buildCrawlDirectiveFix({
      check: "robots_blocks_site",
      robotsContent: "User-agent: *\nDisallow: /",
      sitemapUrl: null,
    });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.changes[0]?.after).toBe("Disallow:");
  });

  it("still declares a sitemap that is missing from robots.txt", () => {
    const fix = buildCrawlDirectiveFix({
      check: "sitemap_not_declared",
      robotsContent: "User-agent: *\nDisallow:",
      sitemapUrl: "https://example.com/sitemap.xml",
    });
    if ("error" in fix) throw new Error(fix.error);
    expect(fix.changes[0]?.after).toContain("Sitemap: https://example.com/sitemap.xml");
  });
});

describe("which page a fix can actually be drafted for", () => {
  const SERVICE = "https://trumoveinc.com/services/packing";
  const POST = "https://trumoveinc.com/blog/true-cost-of-a-move";
  const PLAIN = "https://trumoveinc.com/privacy";
  // A published research report. Its wording is a database row, so no file in
  // the client repository carries it and no lane can draft against one.
  const UNOWNED = "https://trumoveinc.com/research/how-carriers-are-vetted";

  it("offers the wording lane on a service page, whose wording is a data record", () => {
    expect(fixTargetForPage("title_too_short", SERVICE)).toEqual({
      changeKind: "service.page_wording",
      filePath: "src/pages/services/servicesData.ts",
    });
  });

  it("names the posts file for a blog post, not the service data file", () => {
    // fixTargetForPageCheck maps every title check to the service lane. Asking
    // the resolver is what stops a post being drafted against a file that does
    // not contain it.
    expect(fixTargetForPageCheck("title_too_long")?.changeKind).toBe("service.page_wording");
    expect(fixTargetForPage("title_too_long", POST)).toEqual({
      changeKind: "content.blog_post",
      filePath: "src/pages/blog/posts.ts",
    });
  });

  it("offers nothing on a page no governed file renders, rather than a button that dies", () => {
    expect(fixTargetForPageCheck("title_too_short")).not.toBeNull();
    expect(fixTargetForPage("title_too_short", UNOWNED)).toBeNull();
    expect(noFixReasonForPage("title_too_short", UNOWNED)).toContain("No governed lane renders");
  });

  it("draws a static page's wording from the component that renders it", () => {
    expect(fixTargetForPage("title_too_short", PLAIN)).toEqual({
      changeKind: "page.wording",
      filePath: "src/pages/legal/PrivacyPage.tsx",
    });
  });

  it("still offers the description lane there, because it edits the sitewide components", () => {
    expect(fixTargetForPage("description_missing", PLAIN)?.changeKind).toBe("page.metadata");
    expect(noFixReasonForPage("description_missing", PLAIN)).toBeNull();
  });

  it("refuses a finding that carries no address", () => {
    expect(fixTargetForPage("title_missing", null)).toBeNull();
    expect(noFixReasonForPage("title_missing", null)).toContain("names no page address");
  });

  it("says a check no lane owns is manual, whatever page it names", () => {
    expect(fixTargetForPage("thin_content", SERVICE)).toBeNull();
    expect(noFixReasonForPage("thin_content", SERVICE)).toContain("manual fix");
  });
});

describe("buildBrokerStatementFix", () => {
  // Transcribed from maxwest525/brittmove-829a7519 at d983fb0,
  // src/components/trumove/Footer.tsx:168-170, read 2026-09-02.
  const LIVE_FOOTER = [
    '          <p className="text-muted-foreground/60 max-w-[720px]">',
    "            TruMove Inc. arranges transportation through independently authorized FMCSA motor carriers and does not transport household goods.",
    "          </p>",
  ].join("\n");

  const HAS_ALL_BUT_TARIFF = { notTransport: true, arrange: true, tariff: false };

  it("amends the live footer sentence and adds nothing else", () => {
    const built = buildBrokerStatementFix({
      footerContent: LIVE_FOOTER,
      statement: HAS_ALL_BUT_TARIFF,
    });
    expect("error" in built).toBe(false);
    if ("error" in built) return;
    expect(built.changes).toHaveLength(1);
    const [change] = built.changes;
    expect(LIVE_FOOTER).toContain(change!.before);
    expect(change!.after.startsWith(change!.before)).toBe(true);
    expect(change!.after).toMatch(/published tariff\.$/);
  });

  it("refuses when the site already states how charges are determined", () => {
    const built = buildBrokerStatementFix({
      footerContent: LIVE_FOOTER,
      statement: { notTransport: true, arrange: true, tariff: true },
    });
    expect(built).toEqual({
      error: "The site already states how the carrier's charges are determined.",
    });
  });

  it("refuses to write a statement that is missing more than the tariff clause", () => {
    const built = buildBrokerStatementFix({
      footerContent: LIVE_FOOTER,
      statement: { notTransport: false, arrange: false, tariff: false },
    });
    expect("error" in built && built.error).toContain("nothing to replace");
  });

  it("refuses when the governed file does not hold the statement as one sentence", () => {
    const built = buildBrokerStatementFix({
      footerContent: "<p>{brokerLine}</p>",
      statement: HAS_ALL_BUT_TARIFF,
    });
    expect("error" in built && built.error).toContain("not hold it as one sentence");
  });

  it("refuses rather than amend one of several statements", () => {
    const built = buildBrokerStatementFix({
      footerContent: [
        "  <p>TruMove arranges transportation and does not transport goods.</p>",
        "  <p>TruMove Inc. arranges moves with carriers and does not transport them itself.</p>",
      ].join("\n"),
      statement: HAS_ALL_BUT_TARIFF,
    });
    expect("error" in built && built.error).toContain("sentences carrying the statement");
  });

  it("points the broker statement finding at the governed footer file", () => {
    const target = fixTargetForSiteCheck("broker_statement_missing");
    expect(target).toEqual({
      changeKind: "site.footer_wording",
      filePath: "src/components/trumove/Footer.tsx",
    });
  });

  it("leaves the other three broker findings without a fix", () => {
    for (const check of [
      "broker_numbers_missing",
      "broker_numbers_disagree",
      "broker_numbers_off_homepage",
    ]) {
      expect(fixTargetForSiteCheck(check)).toBeNull();
    }
  });
});
