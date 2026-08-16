import { describe, expect, it } from "vitest";

import {
  countByEventName,
  describeBridgeState,
  describeTransportHealth,
  summarizeDedup,
  topSourcePaths,
  type OpenAiAdsEventView,
} from "./config";

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
      describeBridgeState({ OPENAI_ADS_BRIDGE_SECRET: "x", OPENAI_ADS_CAPI_KEY: "y" }),
    ).toMatchObject({ configured: true, capiSecretPresent: true });
  });
});
