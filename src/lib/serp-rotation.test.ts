import { describe, expect, it } from "vitest";

import {
  type DatedPageQueryRow,
  describeRotation,
  readRotation,
  winnersByDate,
} from "./serp-rotation";

/**
 * The fixtures are this tenant's own shape, read from the twenty-four dated
 * page-and-query snapshots on 2026-09-02: a home page and a terms of service
 * page trading the top slot on a comparison query. That is the finding the
 * detector exists to catch, so it is what the tests are built from.
 */
const HOME = "https://trumoveinc.com/";
const TERMS = "https://trumoveinc.com/terms";

function row(
  date: string,
  page: string,
  position: number,
  extra: Partial<DatedPageQueryRow> = {},
): DatedPageQueryRow {
  return {
    date,
    page,
    query: "trumove pricing vs competitors",
    position,
    impressions: 1,
    clicks: 0,
    ...extra,
  };
}

describe("who Google chose on each date", () => {
  it("picks the lowest position, which is the best one", () => {
    const winners = winnersByDate([row("2026-08-03", TERMS, 1), row("2026-08-03", HOME, 4)]);
    expect(winners).toEqual([{ date: "2026-08-03", page: TERMS, position: 1 }]);
  });

  it("breaks a tie by URL so the same rows always read the same way", () => {
    const a = winnersByDate([row("2026-08-03", TERMS, 2), row("2026-08-03", HOME, 2)]);
    const b = winnersByDate([row("2026-08-03", HOME, 2), row("2026-08-03", TERMS, 2)]);
    expect(a).toEqual(b);
    expect(a[0]!.page).toBe(HOME);
  });

  it("returns the run oldest first", () => {
    const winners = winnersByDate([row("2026-08-29", HOME, 1), row("2026-08-03", TERMS, 1)]);
    expect(winners.map((w) => w.date)).toEqual(["2026-08-03", "2026-08-29"]);
  });
});

describe("reading rotation", () => {
  const rotating = [
    row("2026-08-03", TERMS, 1),
    row("2026-08-03", HOME, 5),
    row("2026-08-10", HOME, 1),
    row("2026-08-10", TERMS, 6),
    row("2026-08-17", TERMS, 2),
    row("2026-08-17", HOME, 3),
  ];

  it("reports a query whose chosen page changed", () => {
    const reading = readRotation(rotating);
    expect(reading.rotating).toHaveLength(1);
    expect(reading.settled).toHaveLength(0);
    expect(reading.rotating[0]!.contenders.map((c) => c.page).sort()).toEqual([HOME, TERMS].sort());
  });

  it("does not call it rotation when the same page always won", () => {
    const reading = readRotation([
      row("2026-08-03", HOME, 1),
      row("2026-08-03", TERMS, 8),
      row("2026-08-10", HOME, 1),
      row("2026-08-10", TERMS, 9),
    ]);
    expect(reading.rotating).toHaveLength(0);
    expect(reading.settled).toHaveLength(1);
  });

  it("ignores a query only one page ever answered", () => {
    const reading = readRotation([row("2026-08-03", HOME, 1), row("2026-08-10", HOME, 2)]);
    expect(reading.rotating).toHaveLength(0);
    expect(reading.settled).toHaveLength(0);
  });

  it("counts how many dates each page won, leading with the winner", () => {
    const reading = readRotation([
      ...rotating,
      row("2026-08-24", TERMS, 1),
      row("2026-08-24", HOME, 4),
    ]);
    const [first, second] = reading.rotating[0]!.contenders;
    expect(first!.page).toBe(TERMS);
    expect(first!.datesWon).toBe(3);
    expect(second!.datesWon).toBe(1);
  });

  it("bounds every claim by the dates actually on record", () => {
    expect(readRotation(rotating).datesInWindow).toBe(3);
  });

  it("orders findings by observed impressions, not alphabetically", () => {
    const busy = rotating.map((r) => ({ ...r, query: "busy", impressions: 40 }));
    const quiet = rotating.map((r) => ({ ...r, query: "quiet", impressions: 1 }));
    expect(readRotation([...quiet, ...busy]).rotating[0]!.query).toBe("busy");
  });
});

describe("the sentence the operator reads", () => {
  it("states only what was measured, and recommends nothing", () => {
    const reading = readRotation([
      row("2026-08-03", TERMS, 1),
      row("2026-08-03", HOME, 5),
      row("2026-08-10", HOME, 1),
      row("2026-08-10", TERMS, 6),
    ]);
    const sentence = describeRotation(reading.rotating[0]!);
    expect(sentence).toContain("Google changed which page it showed");
    expect(sentence).toContain("2 observed dates");
    expect(sentence).toContain("Best position reached was 1");
    // No verdict, no remedy: the vendor's own guidance is that the reflex to
    // merge and redirect is usually wrong.
    expect(sentence).not.toMatch(/should|merge|redirect|canonical|fix/i);
  });
});
