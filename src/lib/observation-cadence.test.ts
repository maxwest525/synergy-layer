import { describe, expect, it } from "vitest";

import { allWorkflows } from "@/registry";
import {
  OBSERVATION_SOURCES,
  assertCadenceMayEnable,
  cadenceSource,
  deriveCadenceStatus,
  formatDuration,
  type CadenceFacts,
} from "./observation-cadence";

const base: CadenceFacts = {
  storedRowCount: 0,
  lastStoredAt: null,
  lastRunRowCount: null,
  scheduleExists: false,
  scheduleEnabled: false,
  cron: null,
  nextRunAt: null,
  lastRunAt: null,
  lastDurationMs: null,
  lastRunStatus: null,
  lastError: null,
  lastErrorAt: null,
};

describe("every listed cadence has a workflow that can run it", () => {
  // PageSpeed used to be listed with a switch that could only throw: no
  // workflow, no cron job, and a hook allowlist that refused the key (MEAS-18).
  it("names only sources with a declared workflow behind the schedule key", () => {
    const declared = new Set(allWorkflows().map((workflow) => workflow.key));
    for (const source of OBSERVATION_SOURCES) {
      expect(declared.has(source.scheduleKey), `${source.scheduleKey} is not declared`).toBe(true);
    }
    expect(OBSERVATION_SOURCES.map((source) => source.key)).not.toContain("pagespeed");
  });
});

describe("deriveCadenceStatus", () => {
  it("keeps a source with no stored rows ineligible", () => {
    const status = deriveCadenceStatus(cadenceSource("umami"), base);
    expect(status.eligible).toBe(false);
    expect(status.active).toBe(false);
    expect(status.action).toBe("prove");
  });

  it("asks to enable once a first row exists", () => {
    const status = deriveCadenceStatus(cadenceSource("ga4"), {
      ...base,
      storedRowCount: 1,
      scheduleExists: true,
    });
    expect(status.eligible).toBe(true);
    expect(status.active).toBe(false);
    expect(status.action).toBe("enable");
  });

  it("reports a failing cadence when the last run errored", () => {
    const status = deriveCadenceStatus(cadenceSource("umami"), {
      ...base,
      storedRowCount: 4,
      scheduleExists: true,
      scheduleEnabled: true,
      lastError: "401 Unauthorized",
    });
    expect(status.active).toBe(true);
    expect(status.tone).toBe("danger");
  });

  it("reports an overdue cadence once a whole period has passed with no run recorded", () => {
    const facts: CadenceFacts = {
      ...base,
      storedRowCount: 12,
      scheduleExists: true,
      scheduleEnabled: true,
      cron: "0 16 * * *",
      nextRunAt: "2026-09-01T16:00:00.000Z",
      lastRunAt: "2026-08-31T16:00:04.000Z",
    };
    // Before the following firing the row is simply waiting.
    const waiting = deriveCadenceStatus(
      cadenceSource("gsc"),
      facts,
      new Date("2026-09-02T10:00:00Z"),
    );
    expect(waiting.stateLabel).toBe("Cadence on");
    // A full period past the expected firing, with nothing recorded, is overdue.
    const late = deriveCadenceStatus(cadenceSource("gsc"), facts, new Date("2026-09-02T16:00:01Z"));
    expect(late.stateLabel).toBe("Cadence overdue");
    expect(late.tone).toBe("danger");
    expect(late.instruction).toContain("2026-09-01T16:00:00.000Z");
    expect(late.instruction).toContain("2026-08-31T16:00:04.000Z");
  });

  it("lets a recorded error outrank overdue, and a missing cron never invents one", () => {
    const facts: CadenceFacts = {
      ...base,
      storedRowCount: 12,
      scheduleExists: true,
      scheduleEnabled: true,
      cron: "0 16 * * *",
      nextRunAt: "2026-09-01T16:00:00.000Z",
      lastError: "401 Unauthorized",
    };
    expect(
      deriveCadenceStatus(cadenceSource("gsc"), facts, new Date("2026-09-03T16:00:01Z")).stateLabel,
    ).toBe("Cadence failing");
    expect(
      deriveCadenceStatus(
        cadenceSource("gsc"),
        { ...facts, lastError: null, cron: null },
        new Date("2026-09-03T16:00:01Z"),
      ).stateLabel,
    ).toBe("Cadence on");
  });

  it("never treats an enabled schedule with zero rows as active", () => {
    const status = deriveCadenceStatus(cadenceSource("gsc"), {
      ...base,
      scheduleExists: true,
      scheduleEnabled: true,
    });
    expect(status.active).toBe(false);
  });
});

describe("assertCadenceMayEnable", () => {
  it("refuses an empty source", () => {
    expect(() => assertCadenceMayEnable(cadenceSource("umami"), 0)).toThrow(/stored 0 rows/);
  });

  it("allows a proven source", () => {
    expect(() => assertCadenceMayEnable(cadenceSource("gsc"), 112)).not.toThrow();
  });
});

describe("formatDuration", () => {
  it("formats milliseconds and seconds", () => {
    expect(formatDuration(null)).toBe("Not recorded");
    expect(formatDuration(886)).toBe("886 ms");
    expect(formatDuration(2752)).toBe("2.8 s");
  });
});
