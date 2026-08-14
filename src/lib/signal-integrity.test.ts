import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { isActionCenterItem } from "./action-center";
import { runAgent } from "./agent-runtime.server";
import { observationRecommendationRecord } from "./observation-record";
import { requireScheduleAllowlist } from "./scheduler.server";
import { assertRunnableGraph } from "./workflow-runner.server";

describe("signal integrity", () => {
  it("keeps the recovery trigger function validly dollar-quoted", () => {
    const migration = readFileSync(
      new URL("../../supabase/migrations/20260814070000_signal_integrity_recovery.sql", import.meta.url),
      "utf8",
    );
    expect(migration.split("$sync_action$")).toHaveLength(3);
    expect(migration).toContain(`AS $sync_action$
DECLARE`);
    expect(migration).toContain(`END;
$sync_action$;`);
  });

  it("stores observation-only findings as observed and never approval-gated", () => {
    expect(
      observationRecommendationRecord({
        title: "Weak click-through",
        metadata: { rule: "weak_ctr_page" },
      }),
    ).toMatchObject({
      state: "observed",
      requires_approval: false,
      metadata: { rule: "weak_ctr_page", observationOnly: true },
    });
  });

  it("shows only active change requests and explicitly classified failures in Action Center", () => {
    const base = {
      resolved_at: null,
      lane: "needs_attention",
      subject_kind: null,
      metadata: {},
      changeRequest: null,
    };

    expect(
      isActionCenterItem({
        ...base,
        lane: "pending_approval",
        subject_kind: "change_request",
        changeRequest: { state: "proposed", changes: [], source_commit_sha: null, published_proof_at: null },
      }),
    ).toBe(true);
    expect(isActionCenterItem({ ...base, metadata: { category: "failure" } })).toBe(true);
    expect(isActionCenterItem({ ...base, lane: "fyi" })).toBe(false);
    expect(isActionCenterItem({ ...base, lane: "scheduled" })).toBe(false);
    expect(isActionCenterItem({ ...base, lane: "pending_approval", subject_kind: "agent" })).toBe(false);
    expect(isActionCenterItem({ ...base, lane: "pending_approval", subject_kind: "workflow_run" })).toBe(false);
    expect(
      isActionCenterItem({
        ...base,
        subject_kind: "recommendation",
        metadata: { observationOnly: true },
      }),
    ).toBe(false);
    expect(isActionCenterItem({ ...base, resolved_at: "2026-08-14T00:00:00.000Z" })).toBe(false);
  });

  it("refuses reference-agent execution before touching storage", async () => {
    const client = { from: vi.fn() };
    await expect(runAgent(client as never, "agent-1", "operator-1")).rejects.toThrow(
      /runtime agents are intentionally disabled/i,
    );
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects workflow graphs with agent or approval nodes before execution", () => {
    expect(() =>
      assertRunnableGraph({
        nodes: [{ key: "draft", kind: "agent", ref: "content.strategist" }],
        edges: [],
      }),
    ).toThrow(/agent runtime is not implemented/i);

    expect(() =>
      assertRunnableGraph({
        nodes: [{ key: "review", kind: "approval" }],
        edges: [],
      }),
    ).toThrow(/approval continuation is not implemented/i);

    expect(() =>
      assertRunnableGraph({
        nodes: [{ key: "collect", kind: "capability", ref: "search.console" }],
        edges: [],
      }),
    ).not.toThrow();
  });

  it("requires an explicit non-empty scheduler allowlist", () => {
    expect(() => requireScheduleAllowlist({})).toThrow(/explicit schedule allowlist/i);
    expect(() => requireScheduleAllowlist({ onlyKeys: [] })).toThrow(/explicit schedule allowlist/i);
    expect(requireScheduleAllowlist({ onlyKeys: ["gsc-daily-observe"] })).toEqual(
      new Set(["gsc-daily-observe"]),
    );
  });
});
