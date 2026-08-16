import { describe, expect, it } from "vitest";

import {
  countByEventName,
  describeAttribution,
  describeBridgeState,
  describeDeliveryHealth,
  describeSourceSite,
  describeTransportHealth,
  describeValidationReadiness,
  summarizeDedup,
  topSourcePaths,
  type OpenAiAdsEventView,
} from "./config";
import { describeEventCoverage, unrecognizedEventNames } from "./events";
import { validateCandidateEvent } from "./validation";

const NOW = Date.parse("2026-08-16T00:00:00.000Z");

const event = (overrides: Partial<OpenAiAdsEventView>): OpenAiAdsEventView => ({
  id: crypto.randomUUID(),
  transport: "browser",
  eventName: "page_viewed",
  eventId: "evt-1",
  sourcePath: "/",
  sourceProject: "TruMove Website Final",
  occurredAt: "2026-08-15T23:00:00.000Z",
  receivedAt: "2026-08-15T23:00:01.000Z",
  deliveryStatus: "received",
  deliveryError: null,
  oppref: null,
  attributionSource: null,
  ...overrides,
});

describe("OpenAI Ads instrumentation truth", () => {
  it("reports an unconnected transport as unavailable, never healthy", () => {
    const health = describeTransportHealth([], "capi", NOW);
    expect(health.state).toBe("unavailable");
    expect(health.eventCount).toBe(0);
  });

  it("reports stale when the newest event is older than a day", () => {
    const health = describeTransportHealth(
      [event({ occurredAt: "2026-08-10T00:00:00.000Z" })],
      "browser",
      NOW,
    );
    expect(health.state).toBe("stale");
  });

  it("reports failing when the most recent event failed delivery", () => {
    const health = describeTransportHealth(
      [event({ deliveryStatus: "failed", deliveryError: "429" })],
      "browser",
      NOW,
    );
    expect(health.state).toBe("failing");
    expect(health.failureCount).toBe(1);
  });

  it("counts a shared event id only when both transports reported it", () => {
    expect(
      summarizeDedup([
        event({ eventId: "a" }),
        event({ eventId: "a", transport: "capi" }),
        event({ eventId: "b" }),
      ]),
    ).toEqual({ sharedEventIds: 1, browserOnly: 1, capiOnly: 0 });
  });

  it("derives counts and source paths from logged events only", () => {
    const counts = countByEventName([
      event({ eventName: "lead_created" }),
      event({ eventName: "lead_created", transport: "capi" }),
    ]);
    expect(counts["lead_created"]).toMatchObject({ total: 2, browser: 1, capi: 1 });
    expect(topSourcePaths([event({ sourcePath: "/quote" })])).toEqual([
      { path: "/quote", count: 1 },
    ]);
  });

  it("describes the bridge from secret presence without exposing values", () => {
    expect(describeBridgeState({})).toMatchObject({ configured: false, capiSecretPresent: false });
    expect(
      describeBridgeState({ OPENAI_ADS_BRIDGE_SECRET: "x", OPENAI_ADS_CAPI_API_KEY: "y" }),
    ).toMatchObject({ configured: true, capiSecretPresent: true });
  });

  it("treats a configured secret as configuration, not a proven site connection", () => {
    expect(describeSourceSite([]).state).toBe("not_connected");
    expect(describeSourceSite([event({})]).state).toBe("connected");
  });

  it("reports missing ad click references as unattributed, never as attributed", () => {
    expect(describeAttribution([]).state).toBe("unavailable");
    expect(describeAttribution([event({})])).toMatchObject({
      state: "absent",
      eventsWithOppref: 0,
      eventsWithoutOppref: 1,
    });
    expect(describeAttribution([event({ oppref: "abc" })])).toMatchObject({
      state: "observed",
      distinctOpprefs: 1,
    });
  });

  it("derives provider delivery health from reported status only", () => {
    expect(describeDeliveryHealth([]).state).toBe("unavailable");
    expect(describeDeliveryHealth([event({}), event({})]).state).toBe("clean");
    expect(describeDeliveryHealth([event({ deliveryStatus: "failed" })]).state).toBe("failing");
  });
});

describe("OpenAI Ads event coverage", () => {
  it("never marks an event active without stored events", () => {
    const rows = describeEventCoverage({});
    expect(rows.find((row) => row.name === "page_viewed")?.state).toBe("available");
    expect(rows.find((row) => row.name === "checkout_started")?.state).toBe("not_applicable");
    expect(rows.every((row) => row.state !== "active")).toBe(true);
  });

  it("keeps the unproven TruMove booking boundaries available rather than wired", () => {
    const rows = describeEventCoverage({});
    for (const name of ["appointment_scheduled", "order_created"] as const) {
      const row = rows.find((entry) => entry.name === name)!;
      expect(row.state).toBe("available");
      expect(row.boundaryEvidence.length).toBeGreaterThan(0);
    }
  });

  it("marks an event active only from real stored counts", () => {
    const rows = describeEventCoverage({
      lead_created: { total: 3, browser: 2, capi: 1, lastAt: "2026-08-15T00:00:00.000Z" },
    });
    expect(rows.find((row) => row.name === "lead_created")).toMatchObject({
      state: "active",
      total: 3,
    });
  });

  it("surfaces event names outside the supported catalog", () => {
    expect(
      unrecognizedEventNames({ mystery: { total: 1, browser: 1, capi: 0, lastAt: null } }),
    ).toEqual(["mystery"]);
  });
});

describe("OpenAI Ads validation control", () => {
  const input = { eventName: "lead_created", eventId: "evt-9", transport: "browser" } as const;

  it("never emits and never contacts the provider", () => {
    const report = validateCandidateEvent(input, { existingTransports: [], env: {} });
    expect(report.emitted).toBe(false);
    expect(describeValidationReadiness({}).providerValidationAvailable).toBe(false);
    expect(
      describeValidationReadiness({ OPENAI_ADS_CAPI_API_KEY: "k" }).providerValidationAvailable,
    ).toBe(false);
    expect(report.providerContacted).toBe(false);
    expect(
      report.checks.find((check) => check.label === "Provider validate-only call")?.outcome,
    ).toBe("warn");
  });

  it("fails a duplicate id on the same path and pairs it across paths", () => {
    expect(
      validateCandidateEvent(input, { existingTransports: ["browser"], env: {} }).checks.find(
        (check) => check.label === "Deduplication",
      )?.outcome,
    ).toBe("fail");
    expect(
      validateCandidateEvent(input, { existingTransports: ["capi"], env: {} }).checks.find(
        (check) => check.label === "Deduplication",
      )?.outcome,
    ).toBe("pass");
  });

  it("rejects an event that does not apply to this business", () => {
    const report = validateCandidateEvent(
      { ...input, eventName: "trial_started" },
      { existingTransports: [], env: {} },
    );
    expect(report.checks[0]?.outcome).toBe("fail");
  });
});
