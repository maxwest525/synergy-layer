/**
 * OpenAI Ads instrumentation truth model.
 *
 * Everything in here is derived from events this project actually stored, or
 * from server-side secret presence. Nothing estimates spend, CPC, ROAS,
 * conversions, or campaign delivery, because AOOS has no authenticated read
 * against an OpenAI Ads account.
 */

export const OPENAI_ADS_PIXEL_ID = "LBETxzFzJR34e6FPPhzp6S";

/** The instrumented source project that emits these events. */
export const OPENAI_ADS_SOURCE_PROJECT = "TruMove Website Final";

/** Event names AOOS reports on explicitly. Anything else is shown as "other". */
export const OPENAI_ADS_TRACKED_EVENTS = ["page_viewed", "lead_created"] as const;

export type OpenAiAdsTrackedEvent = (typeof OPENAI_ADS_TRACKED_EVENTS)[number];

export type OpenAiAdsTransport = "browser" | "capi";

export type OpenAiAdsDeliveryStatus = "received" | "delivered" | "failed";

export type OpenAiAdsEventView = {
  id: string;
  transport: OpenAiAdsTransport;
  eventName: string;
  eventId: string;
  sourcePath: string | null;
  sourceProject: string | null;
  occurredAt: string;
  receivedAt: string;
  deliveryStatus: OpenAiAdsDeliveryStatus;
  deliveryError: string | null;
};

export type OpenAiAdsHealth = "unavailable" | "receiving" | "stale" | "failing";

export type SurfaceHealth = {
  state: OpenAiAdsHealth;
  reason: string;
  lastEventAt: string | null;
  eventCount: number;
  failureCount: number;
};

/** Anything older than this without a newer event reads as stale, never healthy. */
export const OPENAI_ADS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function describeTransportHealth(
  events: readonly OpenAiAdsEventView[],
  transport: OpenAiAdsTransport,
  now: number,
): SurfaceHealth {
  const scoped = events.filter((event) => event.transport === transport);
  const failureCount = scoped.filter((event) => event.deliveryStatus === "failed").length;
  const lastEventAt =
    scoped
      .map((event) => event.occurredAt)
      .sort()
      .at(-1) ?? null;

  if (scoped.length === 0) {
    return {
      state: "unavailable",
      reason:
        transport === "browser"
          ? "No browser pixel event has ever reached this project."
          : "No server-side event has ever reached this project.",
      lastEventAt: null,
      eventCount: 0,
      failureCount: 0,
    };
  }

  if (failureCount > 0 && scoped[0]?.deliveryStatus === "failed") {
    return {
      state: "failing",
      reason: "The most recent event was reported as failed delivery.",
      lastEventAt,
      eventCount: scoped.length,
      failureCount,
    };
  }

  const age = lastEventAt ? now - new Date(lastEventAt).getTime() : Number.POSITIVE_INFINITY;
  if (age > OPENAI_ADS_STALE_AFTER_MS) {
    return {
      state: "stale",
      reason: "Events exist, but nothing new arrived in the last 24 hours.",
      lastEventAt,
      eventCount: scoped.length,
      failureCount,
    };
  }

  return {
    state: "receiving",
    reason: "Events arrived in the last 24 hours.",
    lastEventAt,
    eventCount: scoped.length,
    failureCount,
  };
}

export type DedupSummary = {
  sharedEventIds: number;
  browserOnly: number;
  capiOnly: number;
};

/**
 * Deduplication is only provable when the same event id was seen on both
 * transports. One-sided ids are reported as one-sided, not as deduplicated.
 */
export function summarizeDedup(events: readonly OpenAiAdsEventView[]): DedupSummary {
  const browser = new Set<string>();
  const capi = new Set<string>();
  for (const event of events) {
    (event.transport === "browser" ? browser : capi).add(event.eventId);
  }
  let shared = 0;
  for (const id of browser) if (capi.has(id)) shared += 1;
  return {
    sharedEventIds: shared,
    browserOnly: browser.size - shared,
    capiOnly: capi.size - shared,
  };
}

export function countByEventName(
  events: readonly OpenAiAdsEventView[],
): Record<string, { total: number; browser: number; capi: number; lastAt: string | null }> {
  const counts: Record<
    string,
    { total: number; browser: number; capi: number; lastAt: string | null }
  > = {};
  for (const event of events) {
    const bucket = (counts[event.eventName] ??= {
      total: 0,
      browser: 0,
      capi: 0,
      lastAt: null,
    });
    bucket.total += 1;
    if (event.transport === "browser") bucket.browser += 1;
    else bucket.capi += 1;
    if (!bucket.lastAt || event.occurredAt > bucket.lastAt) bucket.lastAt = event.occurredAt;
  }
  return counts;
}

export function topSourcePaths(
  events: readonly OpenAiAdsEventView[],
  limit = 8,
): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.sourcePath) continue;
    counts.set(event.sourcePath, (counts.get(event.sourcePath) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
    .slice(0, limit);
}

export type BridgeState = {
  configured: boolean;
  capiSecretPresent: boolean;
  endpointPath: string;
  requirement: string;
};

/** Secret presence only. The values never leave the server. */
export function describeBridgeState(env: Record<string, string | undefined>): BridgeState {
  const configured = Boolean(env["OPENAI_ADS_BRIDGE_SECRET"]?.trim());
  const capiSecretPresent = Boolean(env["OPENAI_ADS_CAPI_KEY"]?.trim());
  return {
    configured,
    capiSecretPresent,
    endpointPath: "/api/public/hooks/openai-ads-events",
    requirement: configured
      ? "The bridge secret is set. The instrumented project must post events to the bridge endpoint with that shared secret."
      : "Add the OPENAI_ADS_BRIDGE_SECRET secret to this project, then configure the instrumented project to post events to the bridge endpoint with the same value.",
  };
}
