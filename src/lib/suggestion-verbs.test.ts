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

  it("offers no ignore on an open item that has nowhere to store the suppression", () => {
    expect(
      idsFor({ id: "audit:missing_title", kind: "audit", severity: "critical" }),
    ).not.toContain("ignore");
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
