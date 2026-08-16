import { z } from "zod";

import { OPENAI_ADS_PIXEL_ID } from "./config";
import { OPENAI_ADS_SUPPORTED_EVENTS } from "./events";

const eventSchema = z.object({
  eventName: z.enum(OPENAI_ADS_SUPPORTED_EVENTS),
  eventId: z.string().min(1).max(200),
  transport: z.enum(["browser", "capi"]),
  occurredAt: z.string().datetime(),
  sourcePath: z.string().max(500).optional().nullable(),
  sourceProject: z.string().max(200).optional().nullable(),
  oppref: z.string().max(500).optional().nullable(),
  attributionSource: z.string().max(200).optional().nullable(),
  deliveryStatus: z.enum(["received", "delivered", "failed"]).default("received"),
  deliveryError: z.string().max(1000).optional().nullable(),
});

export const ingestPayloadSchema = z.object({
  tenantSlug: z.string().min(1).max(120),
  pixelId: z.string().min(1).max(120),
  events: z.array(eventSchema).max(200),
});

export type OpenAiAdsIngestPayload = z.infer<typeof ingestPayloadSchema>;

export type IngestOutcome =
  { ok: true; stored: number } | { ok: false; status: number; error: string };

type AdminClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> };
    };
    upsert: (
      rows: Record<string, unknown>[],
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

/**
 * Stores exactly what the instrumented project reported. AOOS never synthesises
 * an event, and it never accepts an event for a pixel it does not monitor.
 */
export async function ingestOpenAiAdsEvents(
  admin: AdminClient,
  payload: OpenAiAdsIngestPayload,
): Promise<IngestOutcome> {
  if (payload.pixelId !== OPENAI_ADS_PIXEL_ID) {
    return { ok: false, status: 422, error: "Unmonitored pixel id" };
  }

  const tenant = await admin
    .from("tenants")
    .select("id")
    .eq("slug", payload.tenantSlug)
    .maybeSingle();
  if (tenant.error) return { ok: false, status: 500, error: "Tenant lookup failed" };
  if (!tenant.data) return { ok: false, status: 404, error: "Unknown tenant" };

  const rows = payload.events.map((event) => ({
    tenant_id: tenant.data!.id,
    pixel_id: payload.pixelId,
    transport: event.transport,
    event_name: event.eventName,
    event_id: event.eventId,
    source_path: event.sourcePath ?? null,
    source_project: event.sourceProject ?? null,
    oppref: event.oppref ?? null,
    attribution_source: event.attributionSource ?? null,
    occurred_at: event.occurredAt,
    delivery_status: event.deliveryStatus,
    delivery_error: event.deliveryError ?? null,
    payload: {},
  }));

  const inserted = await admin
    .from("openai_ads_events")
    .upsert(rows, { onConflict: "tenant_id,pixel_id,transport,event_id", ignoreDuplicates: true });
  if (inserted.error) return { ok: false, status: 500, error: inserted.error.message };

  return { ok: true, stored: rows.length };
}
