import { describe, expect, it } from "vitest";

import {
  assertCompleteEvidence,
  assertSameCanonicalProposalPage,
  buildProposalEvidenceGroups,
  buildTitleH1Prompt,
  selectRelevantCompetitorEvidence,
  type ProposalEvidence,
} from "./title-h1-proposals";

const complete: ProposalEvidence = {
  livePage: {
    url: "https://trumoveinc.com/services/corporate-relocation",
    title: "Corporate Relocation | TruMove",
    h1: "Corporate Relocation",
    observedAt: "2026-08-14T12:00:00.000Z",
    renderedBy: "Firecrawl",
  },
  gsc: [
    {
      query: "employee relocation movers",
      date: "2026-08-12",
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
      observedAt: "2026-08-13T00:00:00.000Z",
    },
  ],
};

describe("title/H1 proposal evidence contract", () => {
  it.each(["livePage", "gsc", "competitors"] as const)(
    "refuses when required %s evidence is absent",
    (source) => {
      const evidence = { ...complete, [source]: source === "livePage" ? null : [] };
      expect(() => assertCompleteEvidence(evidence)).toThrow(/required/i);
    },
  );

  it("keeps only active tracked competitors from exact GSC queries", () => {
    const rows = selectRelevantCompetitorEvidence({
      gscQueries: ["employee relocation movers"],
      trackedDomains: ["approved.example"],
      snapshots: [
        {
          target: "employee relocation movers",
          collectedAt: "2026-08-13T00:00:00.000Z",
          rows: [
            {
              type: "organic",
              domain: "approved.example",
              url: "https://approved.example/relocation",
              title: "Employee Relocation Services",
              rank_group: 2,
            },
            {
              type: "organic",
              domain: "unapproved.example",
              url: "https://unapproved.example/relocation",
              title: "Should not be used",
              rank_group: 1,
            },
          ],
        },
        {
          target: "unrelated query",
          collectedAt: "2026-08-13T00:00:00.000Z",
          rows: [
            {
              type: "organic",
              domain: "approved.example",
              url: "https://approved.example/unrelated",
              title: "Wrong query",
              rank_group: 1,
            },
          ],
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        query: "employee relocation movers",
        matchedGscQuery: "employee relocation movers",
        domain: "approved.example",
        position: 2,
      }),
    ]);
  });

  it("uses a substantially related SERP query when no exact snapshot exists", () => {
    const rows = selectRelevantCompetitorEvidence({
      gscQueries: ["employee moving company"],
      trackedDomains: ["approved.example"],
      snapshots: [
        {
          target: "long distance moving company",
          collectedAt: "2026-08-13T00:00:00.000Z",
          rows: [
            {
              type: "organic",
              domain: "approved.example",
              url: "https://approved.example/long-distance-moving",
              title: "Long Distance Moving Company",
              rank_group: 3,
            },
          ],
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        query: "long distance moving company",
        matchedGscQuery: "employee moving company",
        domain: "approved.example",
      }),
    ]);
  });

  it("rejects a generic one-word query overlap", () => {
    const rows = selectRelevantCompetitorEvidence({
      gscQueries: ["employee relocation movers"],
      trackedDomains: ["approved.example"],
      snapshots: [
        {
          target: "long distance movers",
          collectedAt: "2026-08-13T00:00:00.000Z",
          rows: [
            {
              type: "organic",
              domain: "approved.example",
              url: "https://approved.example/long-distance-moving",
              title: "Long Distance Movers",
              rank_group: 3,
            },
          ],
        },
      ],
    });

    expect(rows).toEqual([]);
  });

  it("accepts complete evidence when optional writing guidance is empty", () => {
    expect(() => assertCompleteEvidence(complete)).not.toThrow();
    expect(buildTitleH1Prompt(complete, [])).toContain(
      "DEVIL'S ADVOCATE WRITING GUIDANCE (not empirical evidence; may be empty):\n[]",
    );
  });

  it("builds a wording-only prompt with explicit roles and optional-source absence", () => {
    const prompt = buildTitleH1Prompt(complete, [
      {
        id: "guide-1",
        title: "SEO title guidance",
        excerpt: "Lead with the page subject and write for people.",
        sourceRef: "books/seo-playbook.md",
      },
    ]);
    expect(prompt).toContain("livePage");
    expect(prompt).toContain("gsc");
    expect(prompt).toContain("competitors");
    expect(prompt).toMatch(/ga4[\s\S]*source_of_truth[\s\S]*missing/i);
    expect(prompt).toMatch(/ENRICHMENT[\s\S]*organic market context/);
    expect(prompt).toMatch(/CORROBORATION[\s\S]*paid messaging/);
    expect(prompt).not.toMatch(/Lovable AI Gateway/i);
    expect(prompt).toMatch(/wording only/i);
    expect(prompt.indexOf("DEVIL'S ADVOCATE WRITING GUIDANCE")).toBeGreaterThan(
      prompt.indexOf("SOURCE OF TRUTH"),
    );
    expect(prompt).toContain('"id": "guide-1"');
    expect(prompt).toContain('"sourceRef": "books/seo-playbook.md"');
  });
  it("does not gate generation when GA4 and SerpAPI are missing", () => {
    expect(() => assertCompleteEvidence(complete)).not.toThrow();
    const prompt = buildTitleH1Prompt(complete, []);
    expect(prompt.match(/"status": "missing"/g)?.length).toBe(3);
    expect(prompt).toContain("CROSS-SOURCE REVIEW FLAGS (questions, never verdicts):\n[]");
  });

  it("persists exactly three required evidence groups with optional context nested", () => {
    const groups = buildProposalEvidenceGroups(complete);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.source)).toEqual([
      "live_page",
      "google_search_console",
      "dataforseo_competitors",
    ]);
    expect(groups[2]).toMatchObject({
      queryMatchMode: "exact_query",
      supportingContext: {
        ga4: { role: "source_of_truth", status: "missing" },
        serpapiTransparency: { role: "corroboration", status: "missing" },
        serpapiPaidSerp: { role: "corroboration", status: "missing" },
        knowledge: { role: "devils_advocate", status: "missing", rows: [] },
        contradictionFlags: [],
      },
    });
  });

});

describe("rendered proposal redirect boundary", () => {
  const requested = "https://trumoveinc.com/services/corporate-relocation";

  it("refuses an off-origin rendered redirect before generation", () => {
    expect(() =>
      assertSameCanonicalProposalPage(requested, "https://attacker.example/corporate-relocation"),
    ).toThrow(/rendered redirect|governed origin/i);
  });

  it("refuses a different same-origin rendered path before generation", () => {
    expect(() =>
      assertSameCanonicalProposalPage(requested, "https://trumoveinc.com/services/residential-moving"),
    ).toThrow(/same canonical page/i);
  });

  it("allows only the explicit trailing-slash canonical equivalent", () => {
    expect(() =>
      assertSameCanonicalProposalPage(requested, `${requested}/`),
    ).not.toThrow();
  });
});
