import { describe, expect, it } from "vitest";

import {
  authorityFindingFingerprint,
  extractObservedRanks,
  normalizeTargetUrl,
} from "./evaluate.server";
import { evaluateAuthorityRules } from "./rules";

describe("Authority Science evidence assembly", () => {
  it("extracts only exact canonical-page rank observations", () => {
    const target = "https://trumoveinc.com/services/long-distance-moving";
    const ranks = extractObservedRanks(target, [
      {
        rows: [
          { page: `${target}/`, average_position: 4.3 },
          { page: "https://trumoveinc.com/other", average_position: 1 },
          { url: target, position: 6 },
        ],
      },
    ]);

    expect(ranks).toEqual([4.3, 6]);
    expect(normalizeTargetUrl(`${target}/?utm_source=test`)).toBe(target);
  });

  it("fingerprints the same finding deterministically", () => {
    const finding = evaluateAuthorityRules({
      targetUrl: "https://trumoveinc.com/services/long-distance-moving",
      queryClass: "local_service",
      observedRanks: [4],
      knowledgeChunkIds: ["11111111-1111-4111-8111-111111111111"],
    })[0]!;

    expect(authorityFindingFingerprint(finding)).toBe(authorityFindingFingerprint(finding));
    expect(authorityFindingFingerprint(finding)).toMatch(/^[a-f0-9]{64}$/);
  });
});
