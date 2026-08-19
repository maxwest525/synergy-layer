import { describe, expect, it } from "vitest";

import { evaluatePages, extractPageFacts, groupFindings } from "./page-checks";

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
    const checks = evaluatePages([{ url: "https://a.test/one", facts }]).map((issue) => issue.check);
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
});
