import { describe, expect, it } from "vitest";

import {
  concernStatus,
  groupByPhase,
  isOverdue,
  summarizeCoverage,
  summarizeOwnership,
  type CoverageConcern,
} from "./coverage";

function concern(
  key: string,
  phase: string,
  latest: CoverageConcern["latest"] = null,
): CoverageConcern {
  return {
    id: key,
    key,
    phase,
    task: key,
    description: "",
    priority: 0,
    origin: "framework",
    evidenceSource: null,
    ownerName: null,
    targetDate: null,
    latest,
  };
}

describe("coverage status derivation", () => {
  it("never claims a concern is working without a stored evaluation", () => {
    expect(concernStatus(concern("a", "1"))).toBe("not_evaluated");
  });

  it("uses the stored evaluation status verbatim", () => {
    const evaluated = concern("a", "1", {
      status: "broken",
      summary: "The last read failed.",
      limitation: null,
      evaluatedAt: "2026-08-17T00:00:00Z",
    });
    expect(concernStatus(evaluated)).toBe("broken");
  });

  it("groups by phase in stored order and counts each state", () => {
    const phases = groupByPhase([
      concern("a", "1"),
      concern("b", "1", {
        status: "working",
        summary: "ok",
        limitation: null,
        evaluatedAt: "2026-08-17T00:00:00Z",
      }),
      concern("c", "2"),
    ]);
    expect(phases.map((p) => p.phase)).toEqual(["1", "2"]);
    expect(phases[0]?.counts.working).toBe(1);
    expect(phases[0]?.counts.not_evaluated).toBe(1);
  });

  it("tallies the whole workspace", () => {
    const counts = summarizeCoverage([concern("a", "1"), concern("b", "1")]);
    expect(counts.not_evaluated).toBe(2);
    expect(counts.working).toBe(0);
  });
});

describe("coverage ownership", () => {
  const today = new Date("2026-08-18T00:00:00.000Z");

  it("counts a concern with no owner or no date as unowned", () => {
    const rows = [
      { ...concern("a", "1"), ownerName: "Max", targetDate: "2026-09-01" },
      { ...concern("b", "1"), ownerName: "Max", targetDate: null },
      concern("c", "1"),
    ];
    const summary = summarizeOwnership(rows, today);
    expect(summary.owned).toBe(1);
    expect(summary.unowned).toBe(2);
  });

  it("does not call a working concern overdue", () => {
    const done = {
      ...concern("a", "1", {
        status: "working" as const,
        summary: "proven",
        limitation: null,
        evaluatedAt: "2026-08-17T00:00:00.000Z",
      }),
      ownerName: "Max",
      targetDate: "2026-08-01",
    };
    expect(isOverdue(done, today)).toBe(false);
    expect(summarizeOwnership([done], today).overdue).toBe(0);
  });

  it("counts an open concern past its target date as overdue", () => {
    const late = { ...concern("a", "1"), ownerName: "Max", targetDate: "2026-08-01" };
    expect(isOverdue(late, today)).toBe(true);
    expect(summarizeOwnership([late], today).overdue).toBe(1);
  });
});
