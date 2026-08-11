import { describe, expect, it } from "vitest";

import { canVerifyWithEvidence, parsePostChangeRows } from "./change-request-evidence";

const TARGET = "https://trumoveinc.com/services/corporate-relocation";

const snapshot = (date: string, rows: unknown) => ({ period_start_pt: date, payload: { rows } });

describe("post-change Search Console parser", () => {
  it("reads the real stored object shape", () => {
    const rows = parsePostChangeRows(
      [
        snapshot("2026-08-20", [
          { keys: [TARGET, "employee relocation movers"], clicks: 0, impressions: 3, ctr: 0, position: 41.5 },
        ]),
      ],
      TARGET,
    );
    expect(rows).toEqual([
      {
        date: "2026-08-20",
        query: "employee relocation movers",
        position: 41.5,
        impressions: 3,
        clicks: 0,
      },
    ]);
  });

  it("excludes rows for other pages", () => {
    const rows = parsePostChangeRows(
      [
        snapshot("2026-08-20", [
          { keys: ["https://trumoveinc.com/", "movers"], impressions: 9, position: 12 },
          { keys: [TARGET, "employee moving company"], impressions: 1, position: 60 },
        ]),
      ],
      TARGET,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.query).toBe("employee moving company");
  });

  it("treats malformed or empty payloads as no evidence", () => {
    expect(parsePostChangeRows([], TARGET)).toEqual([]);
    expect(parsePostChangeRows([snapshot("2026-08-20", [])], TARGET)).toEqual([]);
    expect(
      parsePostChangeRows(
        [
          { period_start_pt: "2026-08-20", payload: null },
          { period_start_pt: "2026-08-21", payload: [{ rows: [{ keys: [TARGET, "q"] }] }] },
          { period_start_pt: "2026-08-22", payload: { rows: "nope" } },
          { period_start_pt: "2026-08-23", payload: { rows: [null, { keys: [] }] } },
        ],
        TARGET,
      ),
    ).toEqual([]);
  });
});

describe("verification evidence gate", () => {
  it("refuses verification with zero post-change rows", () => {
    expect(canVerifyWithEvidence({ appliedAt: "2026-08-11T00:00:00Z", postChangeRows: [] })).toBe(false);
    expect(canVerifyWithEvidence({ appliedAt: null, postChangeRows: [{}] })).toBe(false);
  });

  it("allows verification once at least one row exists", () => {
    expect(canVerifyWithEvidence({ appliedAt: "2026-08-11T00:00:00Z", postChangeRows: [{}] })).toBe(true);
  });
});
