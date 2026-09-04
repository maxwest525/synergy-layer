import { describe, expect, it } from "vitest";

import { redundantAgainst } from "./keywords.server";

describe("what a new approval would duplicate", () => {
  it("folds a spelling of a target that is already approved", () => {
    const out = redundantAgainst(
      ["best long distance movers", "top rated long distance movers"],
      ["long distance movers"],
    );
    // Both are the same fourteen-target search; neither becomes its own paid
    // SERP task when one is already tracked.
    expect(out.get("best long distance movers")).toBe("long distance movers");
    expect(out.get("top rated long distance movers")).toBe("long distance movers");
  });

  it("folds duplicates inside one batch, keeping the first spelling to arrive", () => {
    const out = redundantAgainst(
      ["long distance movers", "movers long distance", "long-distance mover"],
      [],
    );
    expect(out.has("long distance movers")).toBe(false);
    expect(out.get("movers long distance")).toBe("long distance movers");
    expect(out.get("long-distance mover")).toBe("long distance movers");
  });

  it("never displaces something already approved with a newcomer", () => {
    const out = redundantAgainst(["movers long distance"], ["long distance movers"]);
    expect(out.get("movers long distance")).toBe("long distance movers");
  });

  it("lets a genuinely different target through", () => {
    const out = redundantAgainst(
      ["piano movers austin", "california to texas movers"],
      ["long distance movers"],
    );
    expect(out.size).toBe(0);
  });

  it("keeps a phrase with no content words, rather than deciding for the operator", () => {
    // "best" is a qualifier and groups with nothing. Dropping it would be the
    // tool making a targeting call, not deduplicating.
    const out = redundantAgainst(["best"], ["long distance movers"]);
    expect(out.size).toBe(0);
  });

  it("ignores blanks, and is case and space insensitive", () => {
    const out = redundantAgainst(["  ", "  Movers Long Distance  "], ["long distance movers"]);
    expect(out.size).toBe(1);
    expect(out.get("movers long distance")).toBe("long distance movers");
  });

  it("does not fold an exact re-approval, which is an idempotent no-op rather than a duplicate", () => {
    // The upsert already ignores duplicates. Calling this redundant would count
    // a no-op as a keyword folded, and the screen would report work not done.
    const out = redundantAgainst(["long distance movers"], ["long distance movers"]);
    expect(out.size).toBe(0);
  });
});
