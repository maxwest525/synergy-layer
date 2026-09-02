import { describe, expect, it } from "vitest";

import { latestGa4RuleRun } from "./ga4-run-words";

describe("the last GA4 rule run, in words", () => {
  const output = {
    attempted: 2,
    succeeded: 2,
    failed: 0,
    results: [
      {
        tenantId: "t-1",
        property: "properties/1",
        status: "succeeded",
        observations: 0,
        reportingDate: "2026-09-01",
        rulesEvaluated: ["zero_engagement_page"],
        unmet: [
          "No snapshot at least 7 days older than 2026-09-01 is stored for properties/1, so page_traffic_loss, page_traffic_gain, event_disappeared did not run.",
        ],
      },
      { tenantId: "t-2", property: "properties/2", status: "failed", error: "boom" },
    ],
  };

  it("picks the caller's tenant out of the step output", () => {
    expect(
      latestGa4RuleRun({ startedAt: "2026-09-01T16:35:00Z", output, tenantId: "t-1" }),
    ).toEqual({
      ranAt: "2026-09-01T16:35:00Z",
      reportingDate: "2026-09-01",
      rulesEvaluated: ["zero_engagement_page"],
      unmet: [
        "No snapshot at least 7 days older than 2026-09-01 is stored for properties/1, so page_traffic_loss, page_traffic_gain, event_disappeared did not run.",
      ],
    });
  });

  it("answers null for a tenant the run did not cover, and for a step that left no words", () => {
    expect(latestGa4RuleRun({ startedAt: null, output, tenantId: "t-9" })).toBeNull();
    expect(
      latestGa4RuleRun({ startedAt: null, output: { noChange: true }, tenantId: "t-1" }),
    ).toBeNull();
    expect(latestGa4RuleRun({ startedAt: null, output: null, tenantId: "t-1" })).toBeNull();
  });

  it("reads a run recorded before the words existed as having no words, not as an error", () => {
    const old = { results: [{ tenantId: "t-1", status: "succeeded", observations: 0 }] };
    expect(
      latestGa4RuleRun({ startedAt: "2026-08-20T16:35:00Z", output: old, tenantId: "t-1" }),
    ).toEqual({
      ranAt: "2026-08-20T16:35:00Z",
      reportingDate: null,
      rulesEvaluated: [],
      unmet: [],
    });
  });
});
