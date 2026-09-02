import { describe, expect, it } from "vitest";

import {
  declaredSitemapsFrom,
  evaluateSite,
  isSitemapIndex,
  pagesMissingFromSitemap,
  robotsBlocksEverything,
  sitemapLocations,
  type ProtocolFacts,
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

  it("reports the declared pages a partial robots block hides", () => {
    // The gap this closes: `robotsBlocksEverything` only ever matched a bare
    // `Disallow: /`, so a robots.txt hiding a whole section read as healthy.
    const findings = evaluateSite({
      ...base,
      robotsBody: "User-agent: *\nDisallow: /services/\nSitemap: https://example.com/sitemap.xml",
      declaredPages: [
        "https://example.com/",
        "https://example.com/services/packing",
        "https://example.com/services/storage",
        "https://example.com/about",
      ],
    });
    const blocked = findings.find((finding) => finding.check === "robots_blocks_pages");
    expect(blocked?.severity).toBe("critical");
    expect(blocked?.label).toContain("2");
    expect(blocked?.detail).toContain("/services/packing");
    expect(blocked?.detail).not.toContain("/about");
    // Fixable, because the sitemap already said which way to resolve it.
    expect(blocked?.fixableByChangeKind).toBe("site.crawl_directives");
  });

  it("says nothing about a blocked page the site never asked to have indexed", () => {
    // Disallowed and declared nowhere is a working configuration: an admin
    // screen, a cart, a search results page. Reporting it would be noise.
    const findings = evaluateSite({
      ...base,
      robotsBody: "User-agent: *\nDisallow: /wp-admin/\nSitemap: https://example.com/sitemap.xml",
      knownPages: ["https://example.com/wp-admin/edit"],
      declaredPages: ["https://example.com/about"],
    });
    expect(findings.map((finding) => finding.check)).not.toContain("robots_blocks_pages");
  });

  it("does not judge another host's pages by this host's robots file", () => {
    // An `sc-domain:` property spans every subdomain, and each host serves its
    // own robots.txt. Only the origin's was read.
    const findings = evaluateSite({
      ...base,
      robotsBody: "User-agent: *\nDisallow: /blog/\nSitemap: https://example.com/sitemap.xml",
      declaredPages: ["https://blog.example.com/blog/launch", "https://example.com/blog/launch"],
    });
    const blocked = findings.find((finding) => finding.check === "robots_blocks_pages");
    expect(blocked?.label).toContain("1");
    expect(blocked?.detail).not.toContain("blog.example.com");
  });

  it("does not raise a partial block when every known page is crawlable", () => {
    const findings = evaluateSite({
      ...base,
      robotsBody: "User-agent: *\nDisallow: /wp-admin/\nSitemap: https://example.com/sitemap.xml",
      declaredPages: ["https://example.com/", "https://example.com/about"],
    });
    expect(findings.map((finding) => finding.check)).not.toContain("robots_blocks_pages");
  });

  it("says nothing about blocked pages when it knows of no pages", () => {
    // Silence is the honest answer here. Claiming zero blocked pages when the
    // audit has read no pages would be a number with nothing behind it.
    const findings = evaluateSite({
      ...base,
      robotsBody: "User-agent: *\nDisallow: /services/\nSitemap: https://example.com/sitemap.xml",
    });
    expect(findings.map((finding) => finding.check)).not.toContain("robots_blocks_pages");
  });

  it("reports the whole site block instead of counting pages when both apply", () => {
    const findings = evaluateSite({
      ...base,
      robotsBody: "User-agent: *\nDisallow: /",
      declaredPages: ["https://example.com/about"],
    });
    const checks = findings.map((finding) => finding.check);
    expect(checks).toContain("robots_blocks_site");
    expect(checks).not.toContain("robots_blocks_pages");
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

describe("the protocol layer under the crawl directives", () => {
  const clean: ProtocolFacts = {
    httpStatus: 301,
    httpLocation: "https://example.com/",
    httpsStatus: 200,
    ttfbMs: 240,
    htmlBytes: 51_000,
    strictTransportSecurity: "max-age=31536000",
    contentSecurityPolicy: "default-src 'self'",
    xContentTypeOptions: "nosniff",
    alternateHost: "www.example.com",
    alternateStatus: 301,
    alternateLocation: "https://example.com/",
    mixedContentUrls: [],
  };

  it("says nothing about a snapshot stored before the protocol read existed", () => {
    expect(evaluateSite(base)).toEqual([]);
  });

  it("finds nothing on a site that redirects, sends its headers, and answers fast", () => {
    expect(evaluateSite({ ...base, protocol: clean })).toEqual([]);
  });

  it("reports plain HTTP that serves instead of redirecting", () => {
    const findings = evaluateSite({
      ...base,
      protocol: { ...clean, httpStatus: 200, httpLocation: null },
    });
    expect(findings.map((f) => f.check)).toEqual(["http_not_redirected"]);
    expect(findings[0]?.detail).toContain("served instead of redirecting");
    expect(findings[0]?.fixableByChangeKind).toBeNull();
  });

  it("says nothing about plain HTTP that could not be fetched at all", () => {
    expect(
      evaluateSite({ ...base, protocol: { ...clean, httpStatus: null, httpLocation: null } }),
    ).toEqual([]);
  });

  it("reports a missing HSTS header and missing hardening headers at their own weights", () => {
    const findings = evaluateSite({
      ...base,
      protocol: {
        ...clean,
        strictTransportSecurity: null,
        contentSecurityPolicy: null,
        xContentTypeOptions: "nosniff",
      },
    });
    const hsts = findings.find((f) => f.check === "hsts_missing");
    const headers = findings.find((f) => f.check === "security_headers_missing");
    expect(hsts?.severity).toBe("warning");
    expect(headers?.severity).toBe("advice");
    expect(headers?.instruction).toContain("Content-Security-Policy");
    expect(headers?.instruction).not.toContain("X-Content-Type-Options");
    expect(headers?.instruction).toContain("not a ranking signal");
  });

  it("reports the other host spelling when it serves its own page or redirects elsewhere", () => {
    const serves = evaluateSite({
      ...base,
      protocol: { ...clean, alternateStatus: 200, alternateLocation: null },
    });
    expect(serves.map((f) => f.check)).toEqual(["host_not_consolidated"]);
    const elsewhere = evaluateSite({
      ...base,
      protocol: { ...clean, alternateStatus: 302, alternateLocation: "https://other.example/" },
    });
    expect(elsewhere.map((f) => f.check)).toEqual(["host_not_consolidated"]);
  });

  it("reports mixed content by count with an example", () => {
    const findings = evaluateSite({
      ...base,
      protocol: {
        ...clean,
        mixedContentUrls: ["http://cdn.example/a.js", "http://x.example/b.png"],
      },
    });
    expect(findings[0]?.check).toBe("mixed_content_present");
    expect(findings[0]?.detail).toContain("2 http:// resource(s)");
  });

  it("reports a slow first byte as one sample against web.dev's figure", () => {
    const findings = evaluateSite({ ...base, protocol: { ...clean, ttfbMs: 1900 } });
    expect(findings[0]?.check).toBe("homepage_slow_to_respond");
    expect(findings[0]?.detail).toContain("1900 ms");
    expect(findings[0]?.detail).toContain("One sample, not a field measurement");
  });
});
