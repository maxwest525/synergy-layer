import { describe, expect, it } from "vitest";

import {
  declaredSitemapsFrom,
  evaluateSite,
  isSitemapIndex,
  pagesMissingFromSitemap,
  robotsBlocksEverything,
  sitemapLocations,
  type SiteFacts,
} from "./site-checks";

const base: SiteFacts = {
  origin: "https://example.com",
  robotsStatus: 200,
  robotsBody: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
  declaredSitemaps: ["https://example.com/sitemap.xml"],
  sitemapUrl: "https://example.com/sitemap.xml",
  sitemapStatus: 200,
  sitemapUrlCount: 12,
  pagesMissingFromSitemap: [],
  unreadablePages: [],
};

describe("robotsBlocksEverything", () => {
  it("detects a site wide block for every crawler", () => {
    expect(robotsBlocksEverything("User-agent: *\nDisallow: /")).toBe(true);
  });

  it("ignores a block scoped to one named crawler", () => {
    expect(robotsBlocksEverything("User-agent: BadBot\nDisallow: /")).toBe(false);
  });

  it("ignores a path level disallow", () => {
    expect(robotsBlocksEverything("User-agent: *\nDisallow: /admin")).toBe(false);
  });
});

describe("declaredSitemapsFrom", () => {
  it("reads every declared sitemap once", () => {
    const body = "Sitemap: https://a.com/s.xml\n# note\nsitemap: https://a.com/s.xml";
    expect(declaredSitemapsFrom(body)).toEqual(["https://a.com/s.xml"]);
  });
});

describe("sitemapLocations", () => {
  it("reads page addresses and recognises an index", () => {
    const xml = "<sitemapindex><sitemap><loc>https://a.com/one.xml</loc></sitemap></sitemapindex>";
    expect(sitemapLocations(xml)).toEqual(["https://a.com/one.xml"]);
    expect(isSitemapIndex(xml)).toBe(true);
  });
});

describe("pagesMissingFromSitemap", () => {
  it("ignores trailing slash and case differences", () => {
    expect(
      pagesMissingFromSitemap({
        reportedUrls: ["https://a.com/one/", "https://a.com/two"],
        sitemapUrls: ["https://a.com/one"],
      }),
    ).toEqual(["https://a.com/two"]);
  });

  it("reports nothing when no sitemap addresses were read", () => {
    expect(
      pagesMissingFromSitemap({ reportedUrls: ["https://a.com/one"], sitemapUrls: [] }),
    ).toEqual([]);
  });
});

describe("evaluateSite", () => {
  it("finds nothing on a healthy site", () => {
    expect(evaluateSite(base)).toEqual([]);
  });

  it("reports a missing robots file", () => {
    const findings = evaluateSite({ ...base, robotsStatus: 404, robotsBody: null });
    expect(findings.map((finding) => finding.check)).toContain("robots_missing");
  });

  it("reports a site wide crawler block as critical", () => {
    const findings = evaluateSite({
      ...base,
      robotsBody: "User-agent: *\nDisallow: /",
    });
    const blocked = findings.find((finding) => finding.check === "robots_blocks_site");
    expect(blocked?.severity).toBe("critical");
  });

  it("reports an empty sitemap and coverage gaps", () => {
    const findings = evaluateSite({
      ...base,
      sitemapUrlCount: 0,
      pagesMissingFromSitemap: ["https://example.com/a", "https://example.com/b"],
    });
    const checks = findings.map((finding) => finding.check);
    expect(checks).toContain("sitemap_empty");
    expect(checks).toContain("sitemap_coverage_gap");
  });

  it("reports pages that would not render as a manual fix", () => {
    const findings = evaluateSite({ ...base, unreadablePages: ["https://example.com/x"] });
    const unreadable = findings.find((finding) => finding.check === "pages_unreadable");
    expect(unreadable?.fixableByChangeKind).toBeNull();
  });
});
