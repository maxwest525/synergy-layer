import { describe, expect, it } from "vitest";

import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "./page-checks";
import {
  buildPageMetadataChanges,
  buildPageMetadataPrompt,
  findPageOwnedDescription,
  selectMetadataSource,
  selectUniqueLiteralSource,
  validatePageMetadataWording,
} from "./page-metadata-proposals";
import { type ProposalEvidence } from "./page-wording-proposals";

const liveMetaDescription =
  "TruMove coordinates corporate relocation end to end with dedicated move coordinators, transparent pricing, and guaranteed dates.";

const complete: ProposalEvidence & { liveMetaDescription: string } = {
  livePage: {
    url: "https://trumoveinc.com/services/corporate-relocation",
    title: "Corporate Relocation | TruMove",
    h1: "Corporate Relocation",
    observedAt: "2026-08-19T12:00:00.000Z",
    renderedBy: "Firecrawl",
  },
  gsc: [
    {
      query: "employee relocation movers",
      date: "2026-08-17",
      position: 18,
      impressions: 14,
      clicks: 1,
    },
  ],
  competitors: [
    {
      query: "employee relocation movers",
      matchedGscQuery: "employee relocation movers",
      domain: "examplemover.com",
      url: "https://examplemover.com/employee-relocation",
      title: "Employee Relocation Movers",
      position: 3,
      observedAt: "2026-08-18T00:00:00.000Z",
    },
  ],
  liveMetaDescription,
};

const validWording = {
  metaDescription:
    "Employee relocation movers with dedicated coordinators, transparent corporate pricing, and guaranteed move dates from TruMove.",
  rationale: "Uses the query language already observed for this page.",
};

describe("page metadata wording contract", () => {
  it("accepts a meta description within the published bounds", () => {
    const wording = validatePageMetadataWording(validWording);
    expect(wording.metaDescription.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(wording.metaDescription.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(wording).toEqual(validWording);
  });

  it("rejects a meta description shorter than the minimum", () => {
    expect(() =>
      validatePageMetadataWording({ ...validWording, metaDescription: "Too short." }),
    ).toThrow(new RegExp(`shorter than ${DESCRIPTION_MIN}`));
  });

  it("rejects a meta description longer than the maximum", () => {
    expect(() =>
      validatePageMetadataWording({
        ...validWording,
        metaDescription: "x".repeat(DESCRIPTION_MAX + 1),
      }),
    ).toThrow(new RegExp(`longer than ${DESCRIPTION_MAX}`));
  });

  it.each(["metaDescription", "rationale"] as const)("rejects a missing %s", (field) => {
    expect(() => validatePageMetadataWording({ ...validWording, [field]: "" })).toThrow(/usable/i);
  });

  it("rejects non-object output", () => {
    expect(() => validatePageMetadataWording(null)).toThrow(/structured JSON object/i);
    expect(() => validatePageMetadataWording([validWording])).toThrow(/structured JSON object/i);
  });
});

describe("page metadata prompt", () => {
  it("builds a wording-only prompt with explicit roles and the live meta description", () => {
    const prompt = buildPageMetadataPrompt(complete, [
      {
        id: "guide-1",
        title: "Meta description guidance",
        excerpt: "Give a searcher a concrete reason to click.",
        sourceRef: "books/seo-playbook.md",
      },
    ]);
    expect(prompt).toMatch(/wording only/i);
    expect(prompt).toMatch(/meta description/i);
    expect(prompt).toContain(`${DESCRIPTION_MIN}`);
    expect(prompt).toContain(`${DESCRIPTION_MAX}`);
    expect(prompt).toContain(liveMetaDescription);
    expect(prompt).toMatch(/SOURCE OF TRUTH[\s\S]*ENRICHMENT[\s\S]*CORROBORATION/);
    expect(prompt).toMatch(/ga4[\s\S]*source_of_truth[\s\S]*missing/i);
    expect(prompt.indexOf("DEVIL'S ADVOCATE WRITING GUIDANCE")).toBeGreaterThan(
      prompt.indexOf("SOURCE OF TRUTH"),
    );
    expect(prompt).toContain('"id": "guide-1"');
  });

  it("does not gate generation when optional sources and guidance are missing", () => {
    const prompt = buildPageMetadataPrompt(complete, []);
    expect(prompt.match(/"status": "missing"/g)?.length).toBe(3);
    expect(prompt).toContain(
      "DEVIL'S ADVOCATE WRITING GUIDANCE (not empirical evidence; may be empty):\n[]",
    );
  });
});

describe("page metadata changes", () => {
  it("builds exactly one exact meta description replacement", () => {
    const changes = buildPageMetadataChanges(liveMetaDescription, validWording);
    expect(changes).toEqual([
      {
        field: "meta_description",
        label: "Meta description",
        before: liveMetaDescription,
        after: validWording.metaDescription,
      },
    ]);
  });

  it("refuses a no-op proposal", () => {
    expect(() => buildPageMetadataChanges(validWording.metaDescription, validWording)).toThrow(
      /must change/i,
    );
  });
});

describe("a page that sets its own description is recognised before the sitewide default is edited", () => {
  it("reads the literal a page passes to SeoHead", () => {
    const source = `
      <SeoHead
        title="TruMove | AI-Powered Moving Made Simple"
        description="TruMove connects you with vetted, top-rated carriers."
        path="/"
      />`;
    expect(findPageOwnedDescription(source)).toBe(
      "TruMove connects you with vetted, top-rated carriers.",
    );
  });

  it("reads a description set directly inside a Helmet block", () => {
    const source = `<Helmet><meta name="description" content="A page-level sentence." /></Helmet>`;
    expect(findPageOwnedDescription(source)).toBe("A page-level sentence.");
  });

  it("reports a description built from an expression as dynamic rather than guessing it", () => {
    const source = `<SeoHead title={title} description={post.summary} path={path} />`;
    expect(findPageOwnedDescription(source)).toBe("dynamic");
  });

  it("returns null for a page that leaves the description to the sitewide default", () => {
    const source = `<SeoHead title="Careers" path="/careers" /> <p>description of the role</p>`;
    expect(findPageOwnedDescription(source)).toBeNull();
  });
});

describe("the description is edited where the page actually sets it", () => {
  const live = "TruMove connects you with vetted, top-rated carriers.";
  const shared = [
    { path: "src/components/seo/SeoHead.tsx", content: "<meta content={description} />" },
    { path: "src/components/seo/DefaultSeo.tsx", content: `const D = "${live}";` },
  ];
  const sitewideDefaultPath = "src/components/seo/DefaultSeo.tsx";

  it("binds to the page's own file when the page sets its own description", () => {
    const selection = selectMetadataSource({
      sharedFiles: shared,
      pageSource: {
        path: "src/pages/Index.tsx",
        content: `<SeoHead title="Home" description="${live}" path="/" />`,
      },
      liveMetaDescription: live,
      sitewideDefaultPath,
    });
    expect(selection.path).toBe("src/pages/Index.tsx");
    expect(selection.pageOwned).toBe(true);
    expect(selection.sitewideDefault).toBe(false);
  });

  it("falls back to the sitewide default only when the page leaves the description to it", () => {
    const selection = selectMetadataSource({
      sharedFiles: shared,
      pageSource: { path: "src/pages/CareersPage.tsx", content: `<SeoHead title="Careers" />` },
      liveMetaDescription: live,
      sitewideDefaultPath,
    });
    expect(selection.path).toBe(sitewideDefaultPath);
    expect(selection.sitewideDefault).toBe(true);
    expect(selection.pageOwned).toBe(false);
  });

  it("refuses when the page's source and the live page disagree, naming both", () => {
    expect(() =>
      selectMetadataSource({
        sharedFiles: shared,
        pageSource: {
          path: "src/pages/Index.tsx",
          content: `<SeoHead title="Home" description="A newer sentence." path="/" />`,
        },
        liveMetaDescription: live,
        sitewideDefaultPath,
      }),
    ).toThrow(/sets a different description/);
  });

  it("refuses a description built from an expression rather than guessing it", () => {
    expect(() =>
      selectMetadataSource({
        sharedFiles: shared,
        pageSource: {
          path: "src/pages/blog/PostPage.tsx",
          content: `<SeoHead title={post.title} description={post.summary} />`,
        },
        liveMetaDescription: live,
        sitewideDefaultPath,
      }),
    ).toThrow(/expression/);
  });

  it("refuses a page file where the live sentence is not exactly one literal", () => {
    expect(() =>
      selectMetadataSource({
        sharedFiles: shared,
        pageSource: {
          path: "src/pages/Index.tsx",
          content: `<SeoHead description="${live}" /> <p>${live}</p>`,
        },
        liveMetaDescription: live,
        sitewideDefaultPath,
      }),
    ).toThrow(/ambiguous/);
  });

  it("uses the shared files alone for a page with no governed source", () => {
    const selection = selectMetadataSource({
      sharedFiles: shared,
      pageSource: null,
      liveMetaDescription: live,
      sitewideDefaultPath,
    });
    expect(selection.path).toBe(sitewideDefaultPath);
  });
});

describe("unique literal source selection", () => {
  const literal = "One exact description.";

  it("selects the one file holding the literal exactly once", () => {
    const chosen = selectUniqueLiteralSource(
      [
        { path: "src/components/seo/SeoHead.tsx", content: `x "${literal}" y` },
        { path: "src/components/seo/DefaultSeo.tsx", content: "unrelated" },
      ],
      literal,
    );
    expect(chosen.path).toBe("src/components/seo/SeoHead.tsx");
  });

  it("refuses when the literal is in no file", () => {
    expect(() =>
      selectUniqueLiteralSource(
        [
          { path: "a.tsx", content: "nothing" },
          { path: "b.tsx", content: "nothing" },
        ],
        literal,
      ),
    ).toThrow(/not one unique literal/i);
  });

  it("refuses when the literal is unique in more than one file", () => {
    expect(() =>
      selectUniqueLiteralSource(
        [
          { path: "a.tsx", content: literal },
          { path: "b.tsx", content: literal },
        ],
        literal,
      ),
    ).toThrow(/ambiguous/i);
  });

  it("does not treat a file with repeated occurrences as a provable source", () => {
    expect(() =>
      selectUniqueLiteralSource([{ path: "a.tsx", content: `${literal} ${literal}` }], literal),
    ).toThrow(/ambiguous/i);
  });

  it("refuses to bind to a bystander file when another file also holds the literal", () => {
    expect(() =>
      selectUniqueLiteralSource(
        [
          { path: "src/components/seo/SeoHead.tsx", content: `${literal} ${literal}` },
          { path: "src/components/seo/DefaultSeo.tsx", content: literal },
        ],
        literal,
      ),
    ).toThrow(/ambiguous/i);
  });
});
