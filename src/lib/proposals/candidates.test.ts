import { describe, expect, it } from "vitest";

import { selectProposalCandidates } from "./candidates";

const rows = [
  { keys: ["https://trumoveinc.com/", "tru moves"], clicks: 0, impressions: 10, position: 8 },
  { keys: ["https://trumoveinc.com/movers", "long distance movers"], clicks: 1, impressions: 40, position: 12 },
  { keys: ["https://competitor.com/x", "movers"], clicks: 0, impressions: 900, position: 3 },
];

describe("selectProposalCandidates", () => {
  it("ranks owned pages by stored impressions and stays bounded", () => {
    const result = selectProposalCandidates({
      rows,
      ownedHosts: ["trumoveinc.com"],
      excludeUrls: [],
      limit: 1,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.url).toBe("https://trumoveinc.com/movers");
    expect(result[0]?.queries).toContain("long distance movers");
  });

  it("excludes pages that already carry a change request", () => {
    const result = selectProposalCandidates({
      rows,
      ownedHosts: ["trumoveinc.com"],
      excludeUrls: ["https://trumoveinc.com/movers/"],
      limit: 5,
    });
    expect(result.map((entry) => entry.url)).toEqual(["https://trumoveinc.com/"]);
  });
});
