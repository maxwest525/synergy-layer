import { describe, expect, it } from "vitest";

import {
  confidenceInCount,
  confidenceInCountChange,
  countChangeZ,
  MAX_CONFIDENCE,
  MIN_BASELINE,
} from "./confidence";

describe("the defect this replaces", () => {
  it("does not give a big change and a tiny one the same number", () => {
    // Both of these arrived on screen as `confidence: 0.7`.
    const big = confidenceInCountChange(400, 100);
    const small = confidenceInCountChange(28, 23);
    expect(big.value).toBeGreaterThan(small.value + 0.3);
  });

  it("moves when the evidence moves", () => {
    const drops = [90, 60, 30, 10].map((after) => confidenceInCountChange(100, after).value);
    // Each larger drop is at least as believable as the one before it.
    for (let index = 1; index < drops.length; index += 1) {
      expect(drops[index]).toBeGreaterThanOrEqual(drops[index - 1] ?? 0);
    }
    expect(drops[0]).toBeLessThan(drops[3] ?? 0);
  });
});

describe("refusing to claim what the counts cannot carry", () => {
  it("will not read a drop from 8 to 2 as evidence", () => {
    // Arithmetically dramatic, evidentially nothing.
    const verdict = confidenceInCountChange(8, 2);
    expect(verdict.band).toBe("low");
    expect(verdict.value).toBeLessThan(0.2);
    expect(verdict.reason).toContain("8");
    expect(verdict.reason).toMatch(/noise|variation/i);
  });

  it("names the baseline it needed rather than failing silently", () => {
    expect(confidenceInCountChange(MIN_BASELINE - 1, 0).reason).toContain(String(MIN_BASELINE - 1));
  });

  it("never claims certainty from two numbers", () => {
    expect(confidenceInCountChange(100_000, 1).value).toBe(MAX_CONFIDENCE);
  });

  it("says so when nothing changed", () => {
    const verdict = confidenceInCountChange(500, 500);
    expect(verdict.value).toBe(0);
    expect(verdict.reason).toMatch(/nothing changed/i);
  });

  it("refuses an unreadable count instead of treating it as zero", () => {
    for (const [before, after] of [
      [Number.NaN, 10],
      [10, Number.NaN],
      [-5, 10],
    ]) {
      const verdict = confidenceInCountChange(before as number, after as number);
      expect(verdict.value).toBe(0);
      expect(verdict.reason).toMatch(/not readable/i);
    }
  });
});

describe("the noise floor is set by the volume, not by a constant", () => {
  it("treats the same absolute drop as weaker evidence at a lower volume", () => {
    // Minus 50 out of 1000 is a wobble. Minus 50 out of 60 is not.
    const atHighVolume = confidenceInCountChange(1000, 950).value;
    const atLowVolume = confidenceInCountChange(60, 10).value;
    expect(atLowVolume).toBeGreaterThan(atHighVolume);
  });

  it("treats the same proportional drop as stronger evidence at a higher volume", () => {
    // Halving is halving, but halving 1000 is far harder to do by accident.
    expect(confidenceInCountChange(1000, 500).value).toBeGreaterThan(
      confidenceInCountChange(20, 10).value,
    );
  });

  it("measures the distance in standard deviations, signed by direction", () => {
    expect(countChangeZ(100, 400)).toBeGreaterThan(0);
    expect(countChangeZ(400, 100)).toBeLessThan(0);
    expect(countChangeZ(100, 100)).toBe(0);
  });
});

describe("always explaining itself", () => {
  it("names both counts in every reason it gives", () => {
    for (const [before, after] of [
      [400, 100],
      [28, 23],
      [8, 2],
      [100, 400],
    ]) {
      const verdict = confidenceInCountChange(before as number, after as number);
      expect(verdict.reason).toContain(String(before));
      expect(verdict.reason).toContain(String(after));
      expect(verdict.reason.length).toBeGreaterThan(20);
    }
  });

  it("says which way it went", () => {
    expect(confidenceInCountChange(400, 100).reason).toContain("fall");
    expect(confidenceInCountChange(100, 400).reason).toContain("rise");
  });
});

describe("a finding that rests on a count existing, not on it moving", () => {
  it("scales down when there is less than the rule needs", () => {
    const verdict = confidenceInCount(30, 100);
    expect(verdict.band).toBe("low");
    expect(verdict.reason).toContain("30");
    expect(verdict.reason).toContain("100");
  });

  it("rises past the threshold with diminishing returns", () => {
    const at = (count: number) => confidenceInCount(count, 100).value;
    expect(at(100)).toBeGreaterThan(at(99));
    expect(at(400) - at(300)).toBeLessThan(at(150) - at(100));
  });

  it("still never reaches certainty from one window", () => {
    expect(confidenceInCount(100_000, 100).value).toBe(MAX_CONFIDENCE);
  });

  it("refuses an unreadable count", () => {
    expect(confidenceInCount(Number.NaN, 100).value).toBe(0);
    expect(confidenceInCount(-1, 100).reason).toMatch(/not readable/i);
  });
});
