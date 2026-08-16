import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  OPENAI_ADS_PIXEL_ID,
  OPENAI_ADS_SOURCE_PROJECT,
  type AttributionState,
  type BridgeState,
  type DedupSummary,
  type DeliveryHealth,
  type OpenAiAdsEventView,
  type SourceSiteState,
  type SurfaceHealth,
  type ValidationReadiness,
} from "./openai-ads/config";
import type { EventCoverageRow } from "./openai-ads/events";
import { validationInputSchema, type ValidationReport } from "./openai-ads/validation";

export type OpenAiAdsState = {
  pixelId: string;
  sourceProject: string;
  bridge: BridgeState;
  sourceSite: SourceSiteState;
  attribution: AttributionState;
  delivery: DeliveryHealth;
  validation: ValidationReadiness;
  browser: SurfaceHealth;
  capi: SurfaceHealth;
  dedup: DedupSummary;
  coverage: EventCoverageRow[];
  unrecognizedEvents: string[];
  sourcePaths: { path: string; count: number }[];
  recentEvents: OpenAiAdsEventView[];
  failedEvents: OpenAiAdsEventView[];
  lastEventAt: string | null;
  totalEvents: number;
};

/**
 * Tenant-scoped read of stored OpenAI Ads instrumentation evidence. A failed
 * read throws instead of reading as "no events", so an outage can never be
 * mistaken for zero traffic.
 */
export const getOpenAiAdsState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpenAiAdsState> => {
    const { requireTenantId } = await import("./tenant.server");
    const {
      countByEventName,
      describeAttribution,
      describeBridgeState,
      describeDeliveryHealth,
      describeSourceSite,
      describeTransportHealth,
      describeValidationReadiness,
      summarizeDedup,
      topSourcePaths,
    } = await import("./openai-ads/config");
    const { describeEventCoverage, unrecognizedEventNames } = await import("./openai-ads/events");

    const tenantId = await requireTenantId(context.supabase);
    const result = await context.supabase
      .from("openai_ads_events")
      .select(
        "id, transport, event_name, event_id, source_path, source_project, occurred_at, received_at, delivery_status, delivery_error, oppref, attribution_source",
      )
      .eq("tenant_id", tenantId)
      .eq("pixel_id", OPENAI_ADS_PIXEL_ID)
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (result.error) {
      throw new Error(`Could not read OpenAI Ads events: ${result.error.message}`);
    }

    const events: OpenAiAdsEventView[] = (result.data ?? []).map((row) => ({
      id: row.id,
      transport: row.transport as OpenAiAdsEventView["transport"],
      eventName: row.event_name,
      eventId: row.event_id,
      sourcePath: row.source_path,
      sourceProject: row.source_project,
      occurredAt: row.occurred_at,
      receivedAt: row.received_at,
      deliveryStatus: row.delivery_status as OpenAiAdsEventView["deliveryStatus"],
      deliveryError: row.delivery_error,
      oppref: row.oppref,
      attributionSource: row.attribution_source,
    }));

    const now = Date.now();
    const counts = countByEventName(events);
    return {
      pixelId: OPENAI_ADS_PIXEL_ID,
      sourceProject: OPENAI_ADS_SOURCE_PROJECT,
      bridge: describeBridgeState(process.env),
      sourceSite: describeSourceSite(events),
      attribution: describeAttribution(events),
      delivery: describeDeliveryHealth(events),
      validation: describeValidationReadiness(process.env),
      browser: describeTransportHealth(events, "browser", now),
      capi: describeTransportHealth(events, "capi", now),
      dedup: summarizeDedup(events),
      coverage: describeEventCoverage(counts),
      unrecognizedEvents: unrecognizedEventNames(counts),
      sourcePaths: topSourcePaths(events),
      recentEvents: events.slice(0, 25),
      failedEvents: events.filter((event) => event.deliveryStatus === "failed").slice(0, 25),
      lastEventAt: events[0]?.occurredAt ?? null,
      totalEvents: events.length,
    };
  });

/**
 * Server-side, non-emitting validation. It checks a candidate event payload
 * against the supported catalog and against stored event ids for deduplication
 * conflicts. It contacts no provider and writes nothing, so it cannot produce a
 * production conversion.
 */
export const validateOpenAiAdsEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => validationInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<ValidationReport> => {
    const { requireTenantId } = await import("./tenant.server");
    const { validateCandidateEvent } = await import("./openai-ads/validation");

    const tenantId = await requireTenantId(context.supabase);
    const existing = await context.supabase
      .from("openai_ads_events")
      .select("transport")
      .eq("tenant_id", tenantId)
      .eq("pixel_id", OPENAI_ADS_PIXEL_ID)
      .eq("event_id", data.eventId)
      .limit(10);
    if (existing.error) {
      throw new Error(`Could not check event id: ${existing.error.message}`);
    }

    return validateCandidateEvent(data, {
      existingTransports: (existing.data ?? []).map((row) => row.transport),
      env: process.env,
    });
  });
