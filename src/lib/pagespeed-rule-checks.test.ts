import { describe, expect, it } from "vitest";

import {
  checkPageSpeedReadings,
  newestReadingPerPage,
  PAGESPEED_RULE_THRESHOLDS,
  type PageSpeedReading,
} from "./pagespeed-rule-checks";

function reading(overrides: Partial<PageSpeedReading> = {}): PageSpeedReading {
  return {
    url: "https://trumoveinc.com/services/corporate-relocation",
    strategy: "mobile",
    lcpMs: 1800,
    cls: 0.02,
    collectedAt: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("the thresholds are Google's, not ours", () => {
  it("carries the published Core Web Vitals bands verbatim", () => {
    expect(PAGESPEED_RULE_THRESHOLDS.lcp.goodMs).toBe(2500);
    expect(PAGESPEED_RULE_THRESHOLDS.lcp.poorMs).toBe(4000);
    expect(PAGESPEED_RULE_THRESHOLDS.cls.good).toBe(0.1);
    expect(PAGESPEED_RULE_THRESHOLDS.cls.poor).toBe(0.25);
  });

  it("stays silent in the needs-improvement band rather than manufacturing a finding", () => {
    // 3s is worse than good and better than poor. Google names that band but
    // does not call it a failure, so neither do we: firing here is exactly how
    // a rule engine starts reporting noise.
    const middle = checkPageSpeedReadings([reading({ lcpMs: 3000, cls: 0.18 })]);
    expect(middle).toEqual([]);
  });

  it("fires only once a reading is past the band Google itself calls poor", () => {
    const slow = checkPageSpeedReadings([reading({ lcpMs: 4200 })]);
    expect(slow.map((draft) => draft.rule)).toEqual(["page_lcp_poor"]);

    const shifting = checkPageSpeedReadings([reading({ cls: 0.4 })]);
    expect(shifting.map((draft) => draft.rule)).toEqual(["page_cls_poor"]);
  });
});

describe("a lab reading is never presented as the field verdict", () => {
  it("says the measurement was a test load, not a judgement about real visitors", () => {
    const [draft] = checkPageSpeedReadings([reading({ lcpMs: 5000 })]);
    expect(draft?.description).toMatch(/one test load rather than a reading from real visitors/i);
    expect(draft?.evidence["measurementKind"]).toBe("lab");
  });

  it("never claims the page fails Core Web Vitals", () => {
    const drafts = checkPageSpeedReadings([reading({ lcpMs: 5000, cls: 0.4 })]);
    for (const draft of drafts) {
      expect(`${draft.title} ${draft.description}`).not.toMatch(/fails core web vitals/i);
    }
  });
});

describe("what the operator is shown", () => {
  it("speaks in seconds and plain words, not metric names", () => {
    const [draft] = checkPageSpeedReadings([reading({ lcpMs: 5200 })]);
    expect(draft?.title).toMatch(/5\.2 seconds/);
    expect(draft?.title).not.toMatch(/LCP|largest contentful paint/i);
  });

  it("keeps the machine-readable value in evidence where copy rules do not reach", () => {
    const [draft] = checkPageSpeedReadings([reading({ lcpMs: 5200 })]);
    expect(draft?.evidence["largestContentfulPaintMs"]).toBe(5200);
    expect(draft?.evidence["googlePoorAboveMs"]).toBe(4000);
  });
});

describe("only the newest reading of a page is judged", () => {
  it("ignores an older run once the page has been measured again", () => {
    const drafts = checkPageSpeedReadings([
      reading({ lcpMs: 9000, collectedAt: "2026-08-01T10:00:00.000Z" }),
      reading({ lcpMs: 1200, collectedAt: "2026-08-20T10:00:00.000Z" }),
    ]);
    expect(drafts).toEqual([]);
  });

  it("treats mobile and desktop as separate measurements of the same page", () => {
    const kept = newestReadingPerPage([
      reading({ strategy: "mobile", lcpMs: 5000 }),
      reading({ strategy: "desktop", lcpMs: 1000 }),
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe("a missing measurement is not a passing one", () => {
  it("says nothing about a metric the provider did not return", () => {
    const drafts = checkPageSpeedReadings([reading({ lcpMs: null, cls: null })]);
    expect(drafts).toEqual([]);
  });
});
