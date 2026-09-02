import { describe, expect, it } from "vitest";

import {
  detectDisappearedEvents,
  detectPageTrafficShift,
  detectSilentEvents,
  detectZeroEngagementPages,
  type DailyEventCounts,
} from "./ga4-rule-checks";

const row = (pagePath: string, eventName: string, sessions: number, eventCount = sessions) => ({
  hostName: "site.com",
  pagePath,
  eventName,
  eventCount,
  activeUsers: sessions,
  sessions,
});

describe("detectPageTrafficShift", () => {
  it("flags a page whose sessions fell past the drop threshold", () => {
    const drafts = detectPageTrafficShift(
      [row("/a", "page_view", 70)],
      [row("/a", "page_view", 100)],
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("page_traffic_loss");
    expect(drafts[0]?.target).toBe("site.com/a");
    expect(drafts[0]?.confidence).toBeGreaterThan(0);
    expect(drafts[0]?.confidence).toBeLessThan(1);
  });

  it("flags a page whose sessions grew past the growth threshold", () => {
    const drafts = detectPageTrafficShift(
      [row("/a", "page_view", 140)],
      [row("/a", "page_view", 100)],
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("page_traffic_gain");
    expect(drafts[0]?.target).toBe("site.com/a");
  });

  it("stays quiet on movement inside the damped-window thresholds", () => {
    const drafts = detectPageTrafficShift(
      [row("/a", "page_view", 90), row("/b", "page_view", 110)],
      [row("/a", "page_view", 100), row("/b", "page_view", 100)],
    );
    expect(drafts).toHaveLength(0);
  });

  it("ignores pages below the prior-session floor", () => {
    const drafts = detectPageTrafficShift([], [row("/tiny", "page_view", 10)]);
    expect(drafts).toHaveLength(0);
  });

  it("takes the max sessions across event rows per page, never the sum", () => {
    // Summing (100 + 90) would fake a 55% drop; the real page sessions moved
    // 100 -> 85, inside the threshold.
    const drafts = detectPageTrafficShift(
      [row("/a", "page_view", 85)],
      [row("/a", "page_view", 100), row("/a", "user_engagement", 90)],
    );
    expect(drafts).toHaveLength(0);
  });

  it("caps loss findings per run", () => {
    const prior = Array.from({ length: 30 }, (_, i) => row(`/ghost-${i}`, "page_view", 100));
    const drafts = detectPageTrafficShift([], prior);
    expect(drafts).toHaveLength(10);
  });
});

describe("detectDisappearedEvents", () => {
  it("flags an event present before and absent now", () => {
    const drafts = detectDisappearedEvents(
      [row("/a", "page_view", 100)],
      [row("/a", "page_view", 100), row("/contact", "generate_lead", 5, 40)],
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("event_disappeared");
    expect(drafts[0]?.target).toBe("generate_lead");
    expect(drafts[0]?.confidence).toBe(0.9);
  });

  it("stays quiet when the event still fires at all", () => {
    const drafts = detectDisappearedEvents(
      [row("/contact", "generate_lead", 2, 5)],
      [row("/contact", "generate_lead", 5, 40)],
    );
    expect(drafts).toHaveLength(0);
  });

  it("ignores events below the prior-count floor", () => {
    const drafts = detectDisappearedEvents([], [row("/contact", "generate_lead", 2, 10)]);
    expect(drafts).toHaveLength(0);
  });

  it("caps findings per run", () => {
    const prior = Array.from({ length: 30 }, (_, i) => row("/a", `custom_event_${i}`, 5, 40));
    const drafts = detectDisappearedEvents([], prior);
    expect(drafts).toHaveLength(10);
  });
});

describe("detectZeroEngagementPages", () => {
  it("flags a high-traffic page with only automatic events", () => {
    const drafts = detectZeroEngagementPages([
      row("/pricing", "page_view", 80),
      row("/pricing", "user_engagement", 60),
      row("/pricing", "scroll", 40),
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("zero_engagement_page");
    expect(drafts[0]?.target).toBe("site.com/pricing");
    expect(drafts[0]?.confidence).toBeGreaterThan(0);
    expect(drafts[0]?.confidence).toBeLessThan(1);
  });

  it("stays quiet when any non-automatic event fires on the page", () => {
    const drafts = detectZeroEngagementPages([
      row("/pricing", "page_view", 80),
      row("/pricing", "generate_lead", 3),
    ]);
    expect(drafts).toHaveLength(0);
  });

  it("ignores pages below the session floor", () => {
    const drafts = detectZeroEngagementPages([row("/quiet", "page_view", 20)]);
    expect(drafts).toHaveLength(0);
  });

  it("caps findings per run", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`/page-${i}`, "page_view", 100));
    const drafts = detectZeroEngagementPages(rows);
    expect(drafts).toHaveLength(10);
  });
});

describe("detectSilentEvents", () => {
  const day = (date: string, counts: Record<string, number>): DailyEventCounts => ({
    date,
    events: Object.entries(counts).map(([eventName, eventCount]) => ({ eventName, eventCount })),
  });
  const prior = Array.from({ length: 7 }, (_, i) =>
    day(`2026-08-${24 + i}`, { page_view: 300 + i, generate_lead: 1 + (i % 2), scroll: 40 }),
  );

  it("names an event that fired on each of the previous seven days and not yesterday", () => {
    const drafts = detectSilentEvents(day("2026-08-31", { page_view: 280, scroll: 35 }), prior);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.rule).toBe("event_silent_yesterday");
    expect(drafts[0]?.target).toBe("generate_lead");
    expect(drafts[0]?.description).toContain("2026-08-31");
    expect(drafts[0]?.evidence["priorDays"]).toHaveLength(7);
  });

  it("counts the automatic page_view: silent there is the tag itself gone", () => {
    const drafts = detectSilentEvents(day("2026-08-31", {}), prior);
    expect(drafts.map((d) => d.target).sort()).toEqual(["generate_lead", "page_view", "scroll"]);
  });

  it("says nothing before seven earlier days are stored, or when the event fired at all", () => {
    expect(detectSilentEvents(day("2026-08-31", {}), prior.slice(0, 6))).toHaveLength(0);
    expect(
      detectSilentEvents(day("2026-08-31", { page_view: 1, generate_lead: 1, scroll: 1 }), prior),
    ).toHaveLength(0);
  });

  it("ignores an event that missed any of the previous seven days", () => {
    const sporadic = prior.map((d, i) =>
      i === 3 ? day(d.date, { page_view: 300, scroll: 40 }) : d,
    );
    const drafts = detectSilentEvents(day("2026-08-31", { page_view: 280, scroll: 35 }), sporadic);
    expect(drafts).toHaveLength(0);
  });
});
