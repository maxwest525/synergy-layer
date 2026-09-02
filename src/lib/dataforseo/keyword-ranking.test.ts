import { describe, expect, it } from "vitest";

import { rankByVolume } from "./keyword-ranking";

const c = (keyword: string, searchVolume: number | null) => ({ keyword, searchVolume });

describe("rankByVolume", () => {
  it("orders by volume and files a low-volume candidate rather than discarding it", () => {
    const ranked = rankByVolume([c("a", 5), c("b", 900), c("c", 0), c("d", 40)], 40);
    expect(ranked.filed.map((entry) => entry.keyword)).toEqual(["b", "d", "a", "c"]);
    expect(ranked.beyondCap).toBe(0);
    expect(ranked.withoutVolume).toBe(0);
  });

  it("keeps a candidate with no volume figure, after the known ones, and counts it", () => {
    const ranked = rankByVolume([c("x", null), c("y", 10), c("z", null)], 40);
    expect(ranked.filed.map((entry) => entry.keyword)).toEqual(["y", "x", "z"]);
    expect(ranked.withoutVolume).toBe(2);
  });

  it("counts what the per-run cap left unfiled instead of dropping it silently", () => {
    const ranked = rankByVolume([c("a", 3), c("b", 2), c("c", 1)], 2);
    expect(ranked.filed.map((entry) => entry.keyword)).toEqual(["a", "b"]);
    expect(ranked.beyondCap).toBe(1);
  });
});
