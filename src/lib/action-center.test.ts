import { describe, expect, it } from "vitest";

import {
  actionCenterFieldChanges,
  actionCenterLane,
  actionCenterStage,
  titleH1ProposalView,
} from "./action-center";

const change = {
  state: "approved",
  changes: [],
  source_commit_sha: null,
  published_proof_at: null,
};

describe("Action Center change request lifecycle", () => {
  it("keeps a legacy completed approval visible until execution is finished", () => {
    expect(actionCenterLane("completed", change)).toBe("in_progress");
    expect(actionCenterStage(change)).toBe("Approved — ready to execute");
  });

  it("keeps applied work visible for outcome tracking", () => {
    expect(actionCenterLane("needs_attention", { ...change, state: "applied" })).toBe(
      "in_progress",
    );
  });

  it("distinguishes a committed approval from one that still needs execution", () => {
    expect(actionCenterStage({ ...change, source_commit_sha: "abc123" })).toBe(
      "Source committed — publish and check next",
    );
  });

  it("closes only terminal change request states", () => {
    for (const state of ["rejected", "verified", "rolled_back"]) {
      expect(actionCenterLane("needs_attention", { ...change, state })).toBe("completed");
    }
  });

  it("keeps exact before and after values for the action card", () => {
    expect(
      actionCenterFieldChanges([
        {
          field: "page_heading",
          label: "Page heading (H1)",
          before: "Corporate Relocation",
          after: "Employee Relocation Moving Services",
        },
      ]),
    ).toEqual([
      {
        field: "page_heading",
        label: "Page heading (H1)",
        before: "Corporate Relocation",
        after: "Employee Relocation Moving Services",
      },
    ]);
  });

  it("exposes the exact title/H1 proposal and only its four decision actions", () => {
    const view = titleH1ProposalView({
      state: "proposed",
      proposal_kind: "title_h1",
      proposal_payload: {
        kind: "title_h1",
        versionNumber: 1,
        targetUrl: "https://trumoveinc.com/page",
        canonicalUrl: "https://trumoveinc.com/page",
        before: { title: "Before title", h1: "Before H1" },
        after: { title: "After title", h1: "After H1" },
        draft: {
          rationale: "Observed page queries use the new wording.",
          expectedMetric: "ctr",
          verification: "Compare finalized GSC windows.",
          reversal: "Restore the captured values.",
        },
        confidence: 0.9,
        evidence: {
          live: { observedAt: "2026-08-10T12:00:00.000Z" },
          gsc: { observedAt: "2026-08-10T13:00:00.000Z", comparisonPeriod: null },
          competitors: [{ observedAt: "2026-08-09T12:00:00.000Z", h1: null }],
          ga4: null,
        },
      },
    });

    expect(view).toMatchObject({
      url: "https://trumoveinc.com/page",
      version: 1,
      current: { title: "Before title", h1: "Before H1" },
      proposed: { title: "After title", h1: "After H1" },
      reason: "Observed page queries use the new wording.",
      expectedMetric: "ctr",
      confidence: 0.9,
      verification: "Compare finalized GSC windows.",
      reversal: "Restore the captured values.",
      actions: ["approve", "edit", "regenerate", "ignore"],
      sourceDates: expect.arrayContaining([
        expect.objectContaining({ source: "live" }),
        expect.objectContaining({ source: "gsc" }),
        expect.objectContaining({ source: "dataforseo" }),
      ]),
      limitations: expect.arrayContaining([
        "No GSC comparison period is stored.",
        "GA4 is not connected for later outcome measurement.",
        "Some competitor pages have no stored H1.",
      ]),
    });
  });
});
