import { describe, expect, it } from "vitest";

import { buildCrawlDirectiveFix, fixTargetForSiteCheck } from "./audit-fixes";

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
