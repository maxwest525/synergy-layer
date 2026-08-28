import { describe, expect, it } from "vitest";

import { buildQueue, type QueueSource } from "./suggestion-queue";
import { verbsFor } from "./suggestion-verbs";

const NOW = "2026-08-21T12:00:00.000Z";

function source(overrides: Partial<QueueSource> & Pick<QueueSource, "id">): QueueSource {
  return {
    kind: "recommendation",
    categoryId: "search",
    title: "Title does not say Tulsa",
    targetUrl: "https://trumoveinc.com/corporate-relocation",
    storedState: "proposed",
    fingerprint: null,
    severity: null,
    linkedChangeId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function idsFor(overrides: Partial<QueueSource> & Pick<QueueSource, "id">): string[] {
  const queue = buildQueue([source(overrides)], NOW);
  const item = [...queue.open, ...queue.ignored, ...queue.done][0];
  if (!item) throw new Error("the fixture produced no queue item");
  return verbsFor(item).map((verb) => verb.id);
}

describe("which verbs a card may offer", () => {
  it("offers ignore on an open suggestion that can be ignored", () => {
    expect(idsFor({ id: "r1" })).toContain("ignore");
  });

  it("does not offer ignore on a row already ignored", () => {
    expect(idsFor({ id: "r1", storedState: "rejected" })).not.toContain("ignore");
  });

  it("offers restore only on an ignored row", () => {
    expect(idsFor({ id: "r1", storedState: "rejected" })).toContain("restore");
    expect(idsFor({ id: "r2" })).not.toContain("restore");
  });

  it("offers a redraft only where a redraft path exists", () => {
    expect(
      idsFor({ id: "c1", kind: "change", proposalType: "title_h1", storedState: "proposed" }),
    ).toContain("regenerate");
    expect(
      idsFor({ id: "c2", kind: "change", proposalType: "page_metadata", storedState: "proposed" }),
    ).not.toContain("regenerate");
  });

  it("offers nothing on a done row, because the decision is made", () => {
    expect(idsFor({ id: "r1", storedState: "applied" })).toEqual([]);
  });

  it("offers ignore on a page check, now that the decision is stored", () => {
    expect(idsFor({ id: "audit:missing_title", kind: "audit", severity: "critical" })).toContain(
      "ignore",
    );
  });

  it("offers no restore on an ignored item that cannot be restored", () => {
    expect(
      idsFor({ id: "c1", kind: "change", storedState: "rejected", proposalType: "title_h1" }),
    ).not.toContain("restore");
  });
});

describe("what each verb tells the operator it will do", () => {
  it("names the cost of the redraft on the verb itself", () => {
    const queue = buildQueue(
      [source({ id: "c1", kind: "change", proposalType: "title_h1", storedState: "proposed" })],
      NOW,
    );
    const redraft = verbsFor(queue.open[0]!).find((verb) => verb.id === "regenerate");
    expect(redraft?.metered).toBe(true);
    expect(redraft?.consequence).toMatch(/one AI call/i);
  });

  it("says an ignore is reversible, so nothing is lost by using it", () => {
    const queue = buildQueue([source({ id: "r1" })], NOW);
    const ignore = verbsFor(queue.open[0]!).find((verb) => verb.id === "ignore");
    expect(ignore?.metered).toBe(false);
    expect(ignore?.consequence).toMatch(/put it back/i);
  });

  it("says the same reversible thing on an audit card, which can also be restored", () => {
    const queue = buildQueue(
      [source({ id: "audit:missing_title", kind: "audit", severity: "critical" })],
      NOW,
    );
    const ignore = verbsFor(queue.open[0]!).find((verb) => verb.id === "ignore");
    expect(ignore?.label).toBe("Not now");
    expect(ignore?.consequence).toMatch(/put it back/i);
  });

  it("labels a change card's ignore as a terminal reject, never a reversible set-aside", () => {
    const queue = buildQueue(
      [
        source({
          id: "c1",
          kind: "change",
          proposalType: "page_metadata",
          storedState: "proposed",
        }),
      ],
      NOW,
    );
    const reject = verbsFor(queue.open[0]!).find((verb) => verb.id === "ignore");
    expect(reject?.label).toBe("Reject");
    expect(reject?.consequence).toMatch(/cannot be undone/i);
    expect(reject?.consequence).not.toMatch(/put it back/i);
  });

  it("never names a rule id or a stored state in operator copy", () => {
    const queue = buildQueue(
      [source({ id: "c1", kind: "change", proposalType: "title_h1", storedState: "proposed" })],
      NOW,
    );
    for (const verb of verbsFor(queue.open[0]!)) {
      expect(`${verb.label} ${verb.consequence}`).not.toMatch(
        /title_h1|page_metadata|proposed|rejected|weak_ctr_page/,
      );
    }
  });
});

describe("drafting a fix straight from the card", () => {
  it("offers a draft on an open suggestion whose fix is governed", () => {
    expect(idsFor({ id: "r1", rule: "weak_ctr_page" })).toContain("draft");
  });

  it("offers no draft where no governed fix exists for the rule", () => {
    expect(idsFor({ id: "r1", rule: "some_rule_nobody_wired" })).not.toContain("draft");
    expect(idsFor({ id: "r1" })).not.toContain("draft");
  });

  it("offers no draft on a page check, which is not a rule finding", () => {
    expect(
      idsFor({ id: "audit:missing_title", kind: "audit", severity: "critical" }),
    ).not.toContain("draft");
  });

  it("names what the draft costs and where the approval still happens", () => {
    const queue = buildQueue([source({ id: "r1", rule: "weak_ctr_page" })], NOW);
    const draft = verbsFor(queue.open[0]!).find((verb) => verb.id === "draft");
    expect(draft?.metered).toBe(true);
    expect(draft?.consequence).toMatch(/approve/i);
  });
});

describe("drafting a site crawl fix straight from the card", () => {
  function siteFinding(check: string): Partial<QueueSource> & Pick<QueueSource, "id"> {
    return {
      id: `site:${check}`,
      kind: "audit",
      categoryId: "health",
      targetUrl: null,
      severity: "critical",
      rule: check,
    };
  }

  it("offers the draft on exactly the site checks a governed lane fixes", () => {
    for (const check of ["robots_blocks_site", "robots_blocks_pages", "sitemap_not_declared"]) {
      expect(idsFor(siteFinding(check))).toContain("draft");
    }
  });

  it("offers no draft on the site checks whose fix is still manual", () => {
    for (const check of [
      "robots_missing",
      "sitemap_missing",
      "sitemap_unreachable",
      "sitemap_empty",
      "sitemap_coverage_gap",
      "pages_unreadable",
    ]) {
      expect(idsFor(siteFinding(check))).not.toContain("draft");
    }
  });

  it("prices the site draft as free, because it is written deterministically", () => {
    const queue = buildQueue([source(siteFinding("robots_blocks_site"))], NOW);
    const draft = verbsFor(queue.open[0]!).find((verb) => verb.id === "draft");
    expect(draft?.metered).toBe(false);
    expect(draft?.consequence).toMatch(/costs nothing/i);
    expect(draft?.consequence).not.toMatch(/AI call/i);
    expect(draft?.consequence).toMatch(/approve/i);
  });
});
