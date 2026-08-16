import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  OPENAI_ADS_PIXEL_ID,
  OPENAI_ADS_SOURCE_PROJECT,
  type BridgeState,
  type DedupSummary,
  type OpenAiAdsEventView,
  type SurfaceHealth,
} from "./openai-ads/config";

export type OpenAiAdsState = {
  pixelId: string;
  sourceProject: string;
  bridge: BridgeState;
  browser: SurfaceHealth;
  capi: SurfaceHealth;
  dedup: DedupSummary;
  eventCounts: Record<
    string,
    { total: number; browser: number; capi: number; lastAt: string | null }
  >;
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
    const { countByEventName, describeBridgeState, describeTransportHealth, summarizeDedup, topSourcePaths } =
      await import("./openai-ads/config");

    const tenantId = await requireTenantId(context.supabase);
    const result = await context.supabase
      .from("openai_ads_events")
      .select(
        "id, transport, event_name, event_id, source_path, source_project, occurred_at, received_at, delivery_status, delivery_error",
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
    }));

    const now = Date.now();
    return {
      pixelId: OPENAI_ADS_PIXEL_ID,
      sourceProject: OPENAI_ADS_SOURCE_PROJECT,
      bridge: describeBridgeState(process.env),
      browser: describeTransportHealth(events, "browser", now),
      capi: describeTransportHealth(events, "capi", now),
      dedup: summarizeDedup(events),
      eventCounts: countByEventName(events),
      sourcePaths: topSourcePaths(events),
      recentEvents: events.slice(0, 25),
      failedEvents: events.filter((event) => event.deliveryStatus === "failed").slice(0, 25),
      lastEventAt: events[0]?.occurredAt ?? null,
      totalEvents: events.length,
    };
  });
