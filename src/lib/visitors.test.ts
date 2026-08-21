import { describe, expect, it } from "vitest";

import { GA4_RULE_THRESHOLDS, type Ga4Row } from "./ga4-rule-checks";
import { buildVisitors, type VisitorFacts } from "./visitors";

/**
 * The fixture is this property's real stored reading, not an invented one:
 * 124 sessions over 28 days, the home page carrying 105 of them and every
 * other page in single figures, against a lead funnel of 21 form views down to
 * 7 leads. Tests written against comfortable numbers would pass on a page that
 * lies at the volume it actually runs at.
 */
function row(pagePath: string, eventName: string, eventCount: number, sessions: number): Ga4Row {
  return {
    hostName: "trumoveinc.com",
    pagePath,
    eventName,
    eventCount,
    activeUsers: sessions,
    sessions,
  };
}

const REAL_ROWS: Ga4Row[] = [
  row("/", "page_view", 256, 105),
  row("/", "user_engagement", 128, 90),
  row("/", "session_start", 122, 105),
  row("/", "scroll", 76, 60),
  row("/", "first_visit", 51, 51),
  row("/", "lead_form_view", 21, 18),
  row("/", "lead_form_start", 15, 13),
  row("/", "form_start", 9, 8),
  row("/", "generate_lead", 7, 7),
  row("/", "quote_step_complete", 7, 6),
  row("/", "quote_submit_outcome", 1, 1),
  row("/", "call_click", 1, 1),
  row("/contact", "page_view", 34, 11),
  row("/inventory-builder", "page_view", 24, 7),
  row("/resources/moving-cost-estimator", "page_view", 19, 6),
  row("/route-planning", "page_view", 10, 6),
  row("/why-trumove", "page_view", 9, 6),
  row("/services", "page_view", 8, 5),
  row("/franchise", "page_view", 6, 4),
  row("/services/corporate-relocation", "page_view", 10, 4),
  row("/dictate", "page_view", 5, 3),
];

function facts(overrides: Partial<VisitorFacts> = {}): VisitorFacts {
  return {
    property: "properties/536830122",
    windowStart: "2026-07-23",
    windowEnd: "2026-08-19",
    collectedAt: "2026-08-20T16:35:03.892Z",
    totalSessions: 124,
    rows: REAL_ROWS,
    truncated: false,
    historyDays: 2,
    findings: 0,
    ...overrides,
  };
}

function answer(view: ReturnType<typeof buildVisitors>, fragment: string) {
  const found = view.answers.find((entry) => entry.question.includes(fragment));
  if (!found) throw new Error(`no question matching ${fragment}`);
  return found;
}

describe("what a hundred and twenty visits can answer", () => {
  it("answers how many came, because a count needs no comparison", () => {
    const view = buildVisitors(facts());
    expect(answer(view, "How many people came").answerable).toBe(true);
    expect(view.reading?.sessions).toBe(124);
    expect(view.reading?.perDay).toBe("4.4");
  });

  it("refuses a per-page verdict while there is nothing to compare against", () => {
    // Two days of readings stored, and the rules compare across seven.
    const view = buildVisitors(facts({ historyDays: 2 }));
    const verdict = answer(view, "go up or down");
    expect(verdict.answerable).toBe(false);
    expect(verdict.because).toMatch(/oldest stored reading is 2 days old/i);
  });

  it("tells one stored reading apart from two readings a day apart", () => {
    // historyDays null means "only one reading exists", which is a different
    // fact from two readings zero days apart.
    const view = buildVisitors(facts({ historyDays: null }));
    expect(answer(view, "go up or down").because).toMatch(/Only one reading is stored/i);
  });

  it("names how few pages could ever carry a verdict, once history exists", () => {
    const view = buildVisitors(facts({ historyDays: 30 }));
    const verdict = answer(view, "go up or down");
    // The home page clears the threshold; nothing else comes close.
    expect(verdict.answerable).toBe(true);
    expect(verdict.because).toMatch(/1 of 10 pages carry enough visits/);
  });

  it("says the busiest page's real number when no page clears the bar", () => {
    const quiet = REAL_ROWS.filter((entry) => entry.pagePath !== "/");
    const view = buildVisitors(facts({ rows: quiet, historyDays: 30, totalSessions: 19 }));
    const verdict = answer(view, "go up or down");
    expect(verdict.answerable).toBe(false);
    expect(verdict.because).toMatch(/The busiest has 11\./);
  });

  it("derives the bar from the rules rather than restating it", () => {
    // If someone lowers a threshold, this sentence has to move with it.
    const quiet = REAL_ROWS.filter((entry) => entry.pagePath !== "/");
    const view = buildVisitors(facts({ rows: quiet, historyDays: 30 }));
    expect(answer(view, "go up or down").because).toContain(
      String(GA4_RULE_THRESHOLDS.trafficShift.minPriorSessions),
    );
  });
});

describe("what visitors actually did", () => {
  it("separates a thing someone did from the browser loading a page", () => {
    const view = buildVisitors(facts());
    const actions = view.actions.map((entry) => entry.name);
    expect(actions).toContain("lead_form_view");
    expect(actions).toContain("generate_lead");
    expect(actions).not.toContain("page_view");
    expect(actions).not.toContain("scroll");
    expect(view.automatic.map((entry) => entry.name)).toContain("page_view");
  });

  it("orders the actions by how often they happened", () => {
    const view = buildVisitors(facts());
    expect(view.actions[0]).toEqual({ name: "lead_form_view", count: 21 });
    expect(view.actions.at(-1)?.count).toBe(1);
  });

  it("counts a page's sessions once rather than once per event", () => {
    // Rows are page x event and the sessions metric repeats across them, so
    // summing turns 105 real sessions on the home page into 465.
    const view = buildVisitors(facts());
    expect(view.pages[0]).toEqual({ page: "trumoveinc.com/", sessions: 105 });
  });

  it("says how many pages it did not list rather than implying there were none", () => {
    const view = buildVisitors(facts());
    expect(view.pages).toHaveLength(8);
    expect(view.pagesBeyondList).toBe(2);
  });
});

describe("the honesty invariants", () => {
  it("says no reading is stored rather than rendering an empty month", () => {
    const view = buildVisitors(null);
    expect(view.reading).toBeNull();
    expect(view.status.text).toMatch(/No analytics reading stored/i);
    expect(view.status.tone).not.toBe("positive");
  });

  it("marks a truncated reading as partial rather than as a total", () => {
    const view = buildVisitors(facts({ truncated: true }));
    expect(view.reading?.partial).toBe(true);
  });

  it("never goes green while a question is out of reach", () => {
    const view = buildVisitors(facts());
    expect(view.answers.some((entry) => !entry.answerable)).toBe(true);
    expect(view.status.tone).not.toBe("positive");
    expect(view.status.text).toMatch(/of 4 questions answerable/);
  });

  it("clears only when every question can be answered", () => {
    const view = buildVisitors(facts({ historyDays: 30 }));
    expect(view.answers.every((entry) => entry.answerable)).toBe(true);
    expect(view.status.tone).toBe("positive");
  });

  it("explains its own silence instead of implying an all-clear", () => {
    const view = buildVisitors(facts());
    expect(view.silence).toMatch(/not the same as nothing being wrong/i);
    expect(view.silence).toMatch(/out of reach at this volume/i);
  });

  it("says nothing about silence once something has been raised", () => {
    const view = buildVisitors(facts({ findings: 3 }));
    expect(view.silence).toBeNull();
  });

  it("calls a genuinely quiet month quiet, not broken", () => {
    const view = buildVisitors(facts({ historyDays: 30, findings: 0 }));
    expect(view.silence).toMatch(/quiet month rather than a broken one/i);
  });

  it("says no visits were recorded rather than showing a zero as a result", () => {
    const view = buildVisitors(facts({ totalSessions: 0, rows: [] }));
    expect(view.status.text).toMatch(/No visits recorded/i);
    expect(answer(view, "How many people came").answerable).toBe(false);
  });
});
