import { describe, expect, it } from "vitest";

import {
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

describe("deriveCadenceStatus", () => {
  it("keeps a source with no stored rows ineligible", () => {
    const status = deriveCadenceStatus(cadenceSource("pagespeed"), base);
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
    expect(() => assertCadenceMayEnable(cadenceSource("pagespeed"), 0)).toThrow(/stored 0 rows/);
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
