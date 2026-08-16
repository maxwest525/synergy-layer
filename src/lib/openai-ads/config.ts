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
  oppref: string | null;
  attributionSource: string | null;
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

export const OPENAI_ADS_BRIDGE_SECRET_NAME = "OPENAI_ADS_BRIDGE_SECRET";
export const OPENAI_ADS_CAPI_SECRET_NAME = "OPENAI_ADS_CAPI_API_KEY";

export type BridgeState = {
  configured: boolean;
  capiSecretPresent: boolean;
  capiSecretName: string;
  bridgeSecretName: string;
  endpointPath: string;
  requirement: string;
};

/** Secret presence only. The values never leave the server. */
export function describeBridgeState(env: Record<string, string | undefined>): BridgeState {
  const configured = Boolean(env[OPENAI_ADS_BRIDGE_SECRET_NAME]?.trim());
  const capiSecretPresent = Boolean(env[OPENAI_ADS_CAPI_SECRET_NAME]?.trim());
  return {
    configured,
    capiSecretPresent,
    capiSecretName: OPENAI_ADS_CAPI_SECRET_NAME,
    bridgeSecretName: OPENAI_ADS_BRIDGE_SECRET_NAME,
    endpointPath: "/api/public/hooks/openai-ads-events",
    requirement: configured
      ? "The bridge secret is set. The instrumented project must post events to the bridge endpoint with that shared secret."
      : `Add the ${OPENAI_ADS_BRIDGE_SECRET_NAME} secret to this project, then configure the instrumented project to post events to the bridge endpoint with the same value.`,
  };
}

export type SourceSiteState = {
  project: string;
  state: "connected" | "not_connected";
  detail: string;
  lastEventAt: string | null;
  distinctProjects: string[];
};

/**
 * The source site counts as connected only when it has actually delivered an
 * event over the bridge. A configured secret alone is configuration, not a
 * connection.
 */
export function describeSourceSite(events: readonly OpenAiAdsEventView[]): SourceSiteState {
  const projects = [
    ...new Set(
      events.map((event) => event.sourceProject).filter((name): name is string => Boolean(name)),
    ),
  ].sort();
  const lastEventAt =
    events
      .map((event) => event.occurredAt)
      .sort()
      .at(-1) ?? null;
  return {
    project: OPENAI_ADS_SOURCE_PROJECT,
    state: events.length > 0 ? "connected" : "not_connected",
    detail:
      events.length > 0
        ? "The instrumented site has delivered events to this project over the bridge."
        : "No event has ever arrived from the instrumented site, so the connection is unproven.",
    lastEventAt,
    distinctProjects: projects,
  };
}

export type AttributionState = {
  state: "observed" | "absent" | "unavailable";
  detail: string;
  eventsWithOppref: number;
  eventsWithoutOppref: number;
  distinctOpprefs: number;
  sources: string[];
};

/**
 * Attribution reporting is limited to what the instrumented site actually
 * reported. A missing ad click reference is reported as missing, never as
 * organic traffic and never as an attributed conversion.
 */
export function describeAttribution(events: readonly OpenAiAdsEventView[]): AttributionState {
  if (events.length === 0) {
    return {
      state: "unavailable",
      detail: "No events have arrived, so attribution cannot be assessed.",
      eventsWithOppref: 0,
      eventsWithoutOppref: 0,
      distinctOpprefs: 0,
      sources: [],
    };
  }
  const withRef = events.filter((event) => Boolean(event.oppref?.trim()));
  const distinct = new Set(withRef.map((event) => event.oppref!.trim()));
  const sources = [
    ...new Set(
      events
        .map((event) => event.attributionSource)
        .filter((value): value is string => Boolean(value?.trim())),
    ),
  ].sort();
  return {
    state: withRef.length > 0 ? "observed" : "absent",
    detail:
      withRef.length > 0
        ? "The instrumented site is reporting an ad click reference on at least some events."
        : "Events are arriving without an ad click reference, so no event on record can be attributed to an ad click.",
    eventsWithOppref: withRef.length,
    eventsWithoutOppref: events.length - withRef.length,
    distinctOpprefs: distinct.size,
    sources,
  };
}

export type DeliveryHealth = {
  state: "unavailable" | "clean" | "degraded" | "failing";
  detail: string;
  received: number;
  delivered: number;
  failed: number;
  lastFailureAt: string | null;
};

/** Provider delivery health, counted from reported delivery status only. */
export function describeDeliveryHealth(events: readonly OpenAiAdsEventView[]): DeliveryHealth {
  if (events.length === 0) {
    return {
      state: "unavailable",
      detail: "No events on record, so provider delivery health is unknown.",
      received: 0,
      delivered: 0,
      failed: 0,
      lastFailureAt: null,
    };
  }
  const failed = events.filter((event) => event.deliveryStatus === "failed");
  const delivered = events.filter((event) => event.deliveryStatus === "delivered").length;
  const received = events.filter((event) => event.deliveryStatus === "received").length;
  const failureRate = failed.length / events.length;
  const state: DeliveryHealth["state"] =
    failed.length === 0 ? "clean" : failureRate >= 0.25 ? "failing" : "degraded";
  return {
    state,
    detail:
      failed.length === 0
        ? "No reported delivery failures on the stored events."
        : `${failed.length} of ${events.length} stored events were reported as failed delivery.`,
    received,
    delivered,
    failed: failed.length,
    lastFailureAt:
      failed
        .map((event) => event.occurredAt)
        .sort()
        .at(-1) ?? null,
  };
}

export type ValidationReadiness = {
  /** True only when a provider validate-only call could be made truthfully. */
  providerValidationAvailable: boolean;
  reason: string;
};

/**
 * A provider validate-only call requires two things AOOS does not have: the
 * server-side credential, and an authoritative OpenAI Ads conversions API
 * document confirming the exact validate-only contract. Until both exist, the
 * only test control offered is a local payload check that contacts nobody and
 * stores nothing.
 */
export function describeValidationReadiness(
  env: Record<string, string | undefined>,
): ValidationReadiness {
  const hasKey = Boolean(env[OPENAI_ADS_CAPI_SECRET_NAME]?.trim());
  return {
    providerValidationAvailable: false,
    reason: hasKey
      ? "The server-side credential is present, but AOOS has not completed authoritative documentation discovery for the OpenAI Ads conversions API validate-only contract. No call is made against the provider until that document is captured, so nothing here can emit a production conversion."
      : `No provider call is possible: the ${OPENAI_ADS_CAPI_SECRET_NAME} secret is not configured, and the validate-only contract has not been confirmed from authoritative documentation. The test control below runs entirely inside this project and emits nothing.`,
  };
}
