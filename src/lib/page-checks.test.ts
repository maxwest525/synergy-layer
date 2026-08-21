import { describe, expect, it } from "vitest";

import type { AnalyzedPage } from "./page-checks";
import {
  CHECKS,
  evaluatePages,
  extractPageFacts,
  groupFindings,
  pageCategory,
  urlDefects,
} from "./page-checks";

const HTML = `<!doctype html><html lang="en"><head>
<title>Movers</title>
<meta name="viewport" content="width=device-width">
<link rel="canonical" href="https://a.test/one">
<script type="application/ld+json">{"@type":"MovingCompany"}</script>
</head><body>
<h1>Trusted movers</h1>
<img src="a.png"><img src="b.png" alt="A truck">
<a href="/two">Two</a>
</body></html>`;

describe("on page checks", () => {
  it("reads the real facts of a rendered page", () => {
    const facts = extractPageFacts(HTML, "some words here", "https://a.test/one");
    expect(facts.title).toBe("Movers");
    expect(facts.h1s).toEqual(["Trusted movers"]);
    expect(facts.canonical).toBe("https://a.test/one");
    expect(facts.imagesMissingAlt).toBe(1);
    expect(facts.jsonLdTypes).toEqual(["MovingCompany"]);
    expect(facts.internalLinks).toBe(1);
    expect(facts.lang).toBe("en");
    expect(facts.metaDescription).toBeNull();
  });

  it("reports missing descriptions, thin titles, images and content", () => {
    const facts = extractPageFacts(HTML, "some words here", "https://a.test/one");
    const checks = evaluatePages([{ url: "https://a.test/one", facts }]).map(
      (issue) => issue.check,
    );
    expect(checks).toContain("description_missing");
    expect(checks).toContain("title_too_short");
    expect(checks).toContain("image_alt_missing");
    expect(checks).toContain("thin_content");
    expect(checks).not.toContain("canonical_missing");
    expect(checks).not.toContain("structured_data_missing");
  });

  it("groups shared wording across pages with the worst finding first", () => {
    const facts = extractPageFacts(HTML, "words", "https://a.test/one");
    const findings = groupFindings(
      evaluatePages([
        { url: "https://a.test/one", facts },
        { url: "https://a.test/two", facts },
      ]),
    );
    const duplicate = findings.find((finding) => finding.check === "h1_duplicate");
    expect(duplicate?.pages).toHaveLength(2);
    expect(findings[0]?.severity).toBe("critical");
  });

  it("thin_content asks for substance without claiming a word-count ranking rule", () => {
    const check = CHECKS.thin_content;
    // "The length of the content alone doesn't matter for ranking purposes
    //  (there's no magical word count target)" — SEO starter guide.
    expect(check.instruction(3).toLowerCase()).not.toMatch(/rank/);
    expect(check.instruction(3)).toMatch(/understand|about|say/i);
  });

  it("description checks say they are about the snippet, not the ranking", () => {
    expect(CHECKS.description_too_long.instruction(2)).toMatch(/results|snippet/i);
  });
});

const IMAGE_HTML = `<html><body>
<img src="a.png" alt="A truck" width="800" height="600">
<img src="b.png" alt="A van">
<img src="c.png" alt="A box" width="400">
</body></html>`;

describe("image dimensions", () => {
  it("counts images that declare neither width nor height, and partial ones", () => {
    const facts = extractPageFacts(IMAGE_HTML, "words", "https://a.test/one");
    expect(facts.imagesMissingDimensions).toBe(2);
  });

  it("reports the check when any image is missing its size", () => {
    const facts = extractPageFacts(IMAGE_HTML, "words", "https://a.test/one");
    const checks = evaluatePages([{ url: "https://a.test/one", facts }]).map((i) => i.check);
    expect(checks).toContain("image_dimensions_missing");
  });

  it("says nothing at all when the stored row predates the field", () => {
    const facts = extractPageFacts(IMAGE_HTML, "words", "https://a.test/one");
    const older = { ...facts, imagesMissingDimensions: undefined };
    const checks = evaluatePages([{ url: "https://a.test/one", facts: older }]).map((i) => i.check);
    expect(checks).not.toContain("image_dimensions_missing");
  });
});

describe("url conventions", () => {
  it("reads underscores and query strings out of the address", () => {
    expect(urlDefects("https://a.test/moving_services")).toEqual({
      underscores: true,
      queryString: false,
    });
    expect(urlDefects("https://a.test/moving-services?id=42")).toEqual({
      underscores: false,
      queryString: true,
    });
    expect(urlDefects("https://a.test/moving-services")).toEqual({
      underscores: false,
      queryString: false,
    });
  });

  it("ignores underscores in the host, which are not path words", () => {
    expect(urlDefects("https://my_host.test/movers").underscores).toBe(false);
  });

  it("does not parse a bare path as a defect it cannot see", () => {
    expect(urlDefects("not a url")).toEqual({ underscores: false, queryString: false });
  });

  it("reports both checks from evaluatePages", () => {
    const facts = extractPageFacts(HTML, "words", "https://a.test/one");
    const checks = evaluatePages([{ url: "https://a.test/moving_services?ref=9", facts }]).map(
      (issue) => issue.check,
    );
    expect(checks).toContain("url_underscores");
    expect(checks).toContain("url_query_string");
  });
});

const linked = (url: string, targets: string[]): AnalyzedPage => ({
  url,
  facts: { ...extractPageFacts(HTML, "words", url), internalLinkTargets: targets },
});

describe("orphan pages", () => {
  it("collects same-host link targets, normalized, from the rendered html", () => {
    const facts = extractPageFacts(
      `<html><body><a href="/two#top">Two</a><a href="/two">Again</a>
       <a href="https://other.test/x">Away</a><a href="#here">Anchor</a></body></html>`,
      "words",
      "https://a.test/one",
    );
    expect(facts.internalLinkTargets).toEqual(["https://a.test/two"]);
  });

  it("reports a page nothing links to as an orphan", () => {
    const issues = evaluatePages([
      linked("https://a.test/", ["https://a.test/two"]),
      linked("https://a.test/two", ["https://a.test/"]),
      linked("https://a.test/hidden", ["https://a.test/"]),
    ]);
    const orphans = issues.filter((issue) => issue.check === "orphan_page").map((i) => i.url);
    expect(orphans).toEqual(["https://a.test/hidden"]);
  });

  it("never calls a page an orphan when the graph was not stored", () => {
    const issues = evaluatePages([
      { url: "https://a.test/", facts: extractPageFacts(HTML, "words", "https://a.test/") },
      { url: "https://a.test/hidden", facts: extractPageFacts(HTML, "words", "https://a.test/h") },
    ]);
    expect(issues.some((issue) => issue.check === "orphan_page")).toBe(false);
  });

  it("says nothing when no home page is among the read pages", () => {
    const issues = evaluatePages([linked("https://a.test/deep/one", [])]);
    expect(issues.some((issue) => issue.check === "orphan_page")).toBe(false);
  });
});

describe("expected schema types", () => {
  it("classifies pages from the address alone, and admits when it cannot", () => {
    expect(pageCategory("https://a.test/")).toBe("home");
    expect(pageCategory("https://a.test/contact-us")).toBe("contact");
    expect(pageCategory("https://a.test/faq")).toBe("question");
    expect(pageCategory("https://a.test/blog/moving-day")).toBe("article");
    expect(pageCategory("https://a.test/services/packing")).toBe("service");
    expect(pageCategory("https://a.test/xyz")).toBe("other");
  });

  it("names the missing type when a page has other structured data", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/contact"), jsonLdTypes: ["WebPage"] };
    const issue = evaluatePages([{ url: "https://a.test/contact", facts }]).find(
      (entry) => entry.check === "structured_data_type_missing",
    );
    expect(issue?.detail).toContain("LocalBusiness");
  });

  it("does not fire on a page with no structured data at all", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/contact"), jsonLdTypes: [] };
    const checks = evaluatePages([{ url: "https://a.test/contact", facts }]).map((i) => i.check);
    expect(checks).toContain("structured_data_missing");
    expect(checks).not.toContain("structured_data_type_missing");
  });

  it("does not fire on a page it could not classify", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/xyz"), jsonLdTypes: ["WebPage"] };
    const checks = evaluatePages([{ url: "https://a.test/xyz", facts }]).map((i) => i.check);
    expect(checks).not.toContain("structured_data_type_missing");
  });

  it("accepts the expected type declared anywhere in the graph", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/faq"), jsonLdTypes: ["WebPage", "FAQPage"] };
    const checks = evaluatePages([{ url: "https://a.test/faq", facts }]).map((i) => i.check);
    expect(checks).not.toContain("structured_data_type_missing");
  });

  it("accepts a documented LocalBusiness subtype like MovingCompany on a home page", () => {
    const facts = extractPageFacts(HTML, "words", "https://a.test/");
    const checks = evaluatePages([{ url: "https://a.test/", facts }]).map((i) => i.check);
    expect(checks).not.toContain("structured_data_type_missing");
  });

  it("glosses an unmapped declared type generically rather than printing its bare name", () => {
    const facts = { ...extractPageFacts(HTML, "words", "https://a.test/contact"), jsonLdTypes: ["Organization"] };
    const issue = evaluatePages([{ url: "https://a.test/contact", facts }]).find(
      (entry) => entry.check === "structured_data_type_missing",
    );
    expect(issue?.detail).toContain("a different kind of structured data (Organization)");
  });
});
