import { describe, expect, it } from "vitest";

import { parseLinkIntersect } from "./link-intersect";

describe("parseLinkIntersect", () => {
  const targets = { "1": "movebuddha.com", "2": "moving.com" };

  it("reads one row per linking domain with the per-competitor links and rank", () => {
    const parsed = parseLinkIntersect(
      [
        {
          target: "nerdwallet.com",
          domain_intersection: {
            "1": { rank: 812, backlinks: 4, referring_pages: 3 },
            "2": { rank: 812, backlinks: 9, referring_pages: 7 },
          },
        },
      ],
      targets,
    );
    expect(parsed.unparsed).toBe(0);
    expect(parsed.rows).toEqual([
      {
        domain: "nerdwallet.com",
        byCompetitor: {
          "movebuddha.com": { backlinks: 4, rank: 812 },
          "moving.com": { backlinks: 9, rank: 812 },
        },
        linksTo: 2,
      },
    ]);
  });

  it("counts an item with no readable linking domain as unparsed rather than dropping it to zero", () => {
    const parsed = parseLinkIntersect([{ domain_intersection: {} }, "nonsense", null], targets);
    expect(parsed.rows).toEqual([]);
    expect(parsed.unparsed).toBe(3);
  });

  it("keeps a missing rank as null and a missing per-competitor entry out of the count", () => {
    const parsed = parseLinkIntersect(
      [{ target: "example.org", domain_intersection: { "1": { backlinks: 2 } } }],
      targets,
    );
    expect(parsed.rows[0]).toEqual({
      domain: "example.org",
      byCompetitor: { "movebuddha.com": { backlinks: 2, rank: null } },
      linksTo: 1,
    });
  });
});
