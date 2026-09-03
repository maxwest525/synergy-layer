import { describe, expect, it } from "vitest";

import { detectSerpRotation } from "../search-console-rule-checks";
import type { DatedPageQueryRow } from "../serp-rotation";
import {
  type ReplayableFinding,
  canonicalFindingText,
  canonicalize,
  compareReplay,
  orderFindings,
  replayDigest,
} from "./replay";

describe("canonical form", () => {
  it("sorts object keys at every depth so key order cannot move the digest", () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("leaves array order alone, because a timeline is a sequence", () => {
    expect(canonicalize([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it("treats negative zero as zero", () => {
    expect(JSON.stringify(canonicalize({ n: -0 }))).toBe('{"n":0}');
  });

  it("drops undefined rather than emitting it inconsistently", () => {
    expect(canonicalize({ a: 1, b: undefined })).toEqual({ a: 1 });
  });
});

describe("finding order", () => {
  const finding = (rule: string, target: string): ReplayableFinding => ({
    rule,
    target,
    description: "d",
    evidence: {},
  });

  it("is independent of the order the detectors ran", () => {
    const one = orderFindings([finding("b", "x"), finding("a", "y")]);
    const two = orderFindings([finding("a", "y"), finding("b", "x")]);
    expect(one).toEqual(two);
  });
});

/**
 * The replay that matters: a frozen evidence fixture through the real rotation
 * detector, asserted by digest.
 *
 * The fixture is this tenant's own shape, read from the dated page-and-query
 * snapshots on 2026-09-02: a home page and a terms of service page trading the
 * top slot on a comparison query. If this digest moves, either the rule changed
 * deliberately and the new digest is committed with the reason, or something
 * non-deterministic reached the detector.
 */
describe("the rotation rule replays", () => {
  const HOME = "https://trumoveinc.com/";
  const TERMS = "https://trumoveinc.com/terms";

  const FIXTURE: DatedPageQueryRow[] = [
    {
      date: "2026-08-03",
      page: TERMS,
      query: "trumove pricing vs competitors",
      position: 1,
      impressions: 3,
      clicks: 0,
    },
    {
      date: "2026-08-03",
      page: HOME,
      query: "trumove pricing vs competitors",
      position: 5,
      impressions: 2,
      clicks: 0,
    },
    {
      date: "2026-08-10",
      page: HOME,
      query: "trumove pricing vs competitors",
      position: 1,
      impressions: 4,
      clicks: 1,
    },
    {
      date: "2026-08-10",
      page: TERMS,
      query: "trumove pricing vs competitors",
      position: 6,
      impressions: 1,
      clicks: 0,
    },
    {
      date: "2026-08-17",
      page: TERMS,
      query: "trumove pricing vs competitors",
      position: 2,
      impressions: 2,
      clicks: 0,
    },
    {
      date: "2026-08-17",
      page: HOME,
      query: "trumove pricing vs competitors",
      position: 3,
      impressions: 2,
      clicks: 0,
    },
  ];

  function run(rows: DatedPageQueryRow[]): ReplayableFinding[] {
    return detectSerpRotation(rows).map((draft) => ({
      rule: draft.rule,
      target: draft.target,
      description: draft.description,
      evidence: draft.evidence,
    }));
  }

  it("gives the same digest for the same rows, twice", () => {
    expect(replayDigest(run(FIXTURE))).toBe(replayDigest(run(FIXTURE)));
  });

  it("gives the same digest however the rows are ordered on the way in", () => {
    const shuffled = [FIXTURE[3]!, FIXTURE[0]!, FIXTURE[5]!, FIXTURE[1]!, FIXTURE[4]!, FIXTURE[2]!];
    expect(replayDigest(run(shuffled))).toBe(replayDigest(run(FIXTURE)));
  });

  it("holds the recorded digest for this fixture", () => {
    // Recorded 2026-09-03 from a real run, not written by hand. The first
    // draft of this test carried an invented hex string and failed, which is
    // exactly what should happen to a number nobody measured.
    //
    // Changing this line is a deliberate act: it means the rule now reads the
    // same rows differently, and the reason belongs in the commit that moves it.
    const RECORDED = "63672436a3d577e25cca8a7eae2129946d795d880a18d2cc842488b1a301f711";
    const comparison = compareReplay(run(FIXTURE), RECORDED, undefined);
    expect(comparison.stable, `digest is now ${comparison.digest}`).toBe(true);
  });

  it("changes the digest when the evidence changes", () => {
    const settled = FIXTURE.map((row) =>
      row.page === HOME ? { ...row, position: 1 } : { ...row, position: 9 },
    );
    expect(replayDigest(run(settled))).not.toBe(replayDigest(run(FIXTURE)));
  });

  it("says where two runs first diverged, not just that they did", () => {
    const before = canonicalFindingText(run(FIXTURE));
    const changed = run(FIXTURE.map((row) => ({ ...row, impressions: row.impressions + 1 })));
    const comparison = compareReplay(changed, "not-the-digest", before);
    expect(comparison.stable).toBe(false);
    if (!comparison.stable) expect(comparison.firstDifference).toMatch(/^Line \d+:/);
  });
});
