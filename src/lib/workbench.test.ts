import { describe, expect, it } from "vitest";

import {
  type BenchChange,
  type BenchFinding,
  benchCoverage,
  buildBench,
  stuckAtFor,
} from "./workbench";

function finding(id: string, rule: string | null): BenchFinding {
  return {
    id,
    title: `Finding ${id}`,
    rule,
    sourceModule: "search-console",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function change(overrides: Partial<BenchChange> & { id: string }): BenchChange {
  return {
    recommendationId: null,
    title: `Change ${overrides.id}`,
    state: "proposed",
    committedSha: null,
    provenAt: null,
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("where a change has stopped", () => {
  it("separates approved-and-committed from approved-and-not", () => {
    expect(stuckAtFor(change({ id: "a", state: "approved" }))).toBe("approved_not_committed");
    expect(stuckAtFor(change({ id: "b", state: "approved", committedSha: "abc123" }))).toBe(
      "committed_not_proven",
    );
  });

  it("counts a proven change as done whatever the row still says", () => {
    // The four stuck rows are the reason this distinction exists: `approved`
    // alone never said whether the executor had run.
    const proven = change({
      id: "c",
      state: "approved",
      committedSha: "abc123",
      provenAt: "2026-09-01T10:00:00.000Z",
    });
    expect(stuckAtFor(proven)).toBe("done");
    expect(stuckAtFor(change({ id: "d", state: "verified" }))).toBe("done");
  });

  it("treats rejected and rolled back as closed rather than stuck", () => {
    expect(stuckAtFor(change({ id: "e", state: "rejected" }))).toBe("closed");
    expect(stuckAtFor(change({ id: "f", state: "rolled_back" }))).toBe("closed");
  });

  it("leads with what is furthest along and therefore most nearly wasted", () => {
    const bench = buildBench({
      findings: [],
      changes: [
        change({ id: "waiting", state: "proposed" }),
        change({ id: "committed", state: "approved", committedSha: "abc" }),
        change({ id: "uncommitted", state: "approved" }),
      ],
    });
    expect(bench.inFlight.map((row) => row.id)).toEqual(["committed", "uncommitted", "waiting"]);
  });

  it("names the state in the row's own word as well as in plain words", () => {
    const bench = buildBench({
      findings: [],
      changes: [change({ id: "x", state: "approved", committedSha: "abc" })],
    });
    expect(bench.inFlight[0]!.stuckLabel).toContain("not yet proven live");
    expect(bench.inFlight[0]!.stuckLabel).toContain("approved");
  });
});

describe("bucketing the findings", () => {
  it("puts a rule with a governed lane on the ready pile", () => {
    const bench = buildBench({ findings: [finding("1", "striking_distance_query")], changes: [] });
    expect(bench.ready.map((row) => row.id)).toEqual(["1"]);
    expect(bench.blocked).toHaveLength(0);
  });

  it("groups blocked findings by the reason the rule already carries", () => {
    const bench = buildBench({
      findings: [
        finding("1", "zero_impression_page"),
        finding("2", "zero_impression_page"),
        finding("3", "index_coverage_drift"),
      ],
      changes: [],
    });
    expect(bench.ready).toHaveLength(0);
    // Two rules, two distinct reasons, largest group first.
    expect(bench.blocked[0]!.findings).toHaveLength(2);
    expect(bench.blocked[0]!.rules).toEqual(["zero_impression_page"]);
    expect(bench.blocked.every((group) => group.reason.length > 0)).toBe(true);
  });

  it("drops a finding from the piles once something has been drafted from it", () => {
    const bench = buildBench({
      findings: [finding("1", "striking_distance_query")],
      changes: [change({ id: "cr", recommendationId: "1" })],
    });
    expect(bench.ready).toHaveLength(0);
    expect(bench.inFlight.map((row) => row.id)).toEqual(["cr"]);
  });

  it("keeps a finding with no rule apart rather than calling it blocked", () => {
    const bench = buildBench({ findings: [finding("1", null), finding("2", "")], changes: [] });
    expect(bench.unattributed.map((row) => row.id)).toEqual(["1", "2"]);
    expect(bench.blocked).toHaveLength(0);
    expect(bench.ready).toHaveLength(0);
  });
});

describe("the number the bench exists to move", () => {
  it("counts every finding once, and only lanes-with-a-fix as actionable", () => {
    const bench = buildBench({
      findings: [
        finding("1", "striking_distance_query"),
        finding("2", "approved_keyword_no_page"),
        finding("3", "approved_keyword_no_page"),
        finding("4", null),
        finding("5", "weak_ctr_page"),
      ],
      changes: [change({ id: "cr", recommendationId: "5" })],
    });
    const coverage = benchCoverage(bench);
    expect(coverage.actionable).toBe(2); // finding 1, plus the drafted change
    expect(coverage.blockedCount).toBe(2); // the two keyword-no-page findings
    expect(coverage.total).toBe(5);
  });
});
