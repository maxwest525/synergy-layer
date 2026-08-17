import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  connectionUpdateSchema,
  eventRuleUpdateSchema,
  type CapiSettingsState,
  type ConnectionView,
  type DeliveryView,
  type EventRuleView,
} from "./openai-ads/capi-settings";

/**
 * Tenant-scoped read of the server-side conversions configuration and its
 * delivery evidence. The provider credential is never returned; only whether
 * the server can see one.
 */
export const getOpenAiAdsCapiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CapiSettingsState> => {
    const { requireTenantId } = await import("./tenant.server");
    const { OPENAI_ADS_EVENT_DATA_SHAPE } = await import("./openai-ads/capi-contract");

    const tenantId = await requireTenantId(context.supabase);

    const [connectionQuery, rulesQuery, deliveriesQuery, adminQuery] = await Promise.all([
      context.supabase
        .from("openai_ads_connections")
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      context.supabase
        .from("openai_ads_event_rules")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("event_type", { ascending: true }),
      context.supabase
        .from("openai_ads_deliveries")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("last_attempt_at", { ascending: false })
        .limit(50),
      context.supabase.rpc("is_tenant_admin", { _tenant_id: tenantId }),
    ]);

    if (connectionQuery.error) {
      throw new Error(
        `Could not read the conversions configuration: ${connectionQuery.error.message}`,
      );
    }
    if (rulesQuery.error) {
      throw new Error(`Could not read the conversion events: ${rulesQuery.error.message}`);
    }
    if (deliveriesQuery.error) {
      throw new Error(`Could not read delivery history: ${deliveriesQuery.error.message}`);
    }

    const row = connectionQuery.data as Record<string, never> | null;
    const raw = row as unknown as Record<string, unknown> | null;
    const connection: ConnectionView | null = raw
      ? {
          id: String(raw["id"]),
          enabled: Boolean(raw["enabled"]),
          pixelId: String(raw["pixel_id"]),
          sourceProject: String(raw["source_project"]),
          canonicalOrigin: String(raw["canonical_origin"]),
          allowedOrigins: (raw["allowed_origins"] as string[]) ?? [],
          deliveryMode: raw["delivery_mode"] as ConnectionView["deliveryMode"],
          requestTimeoutMs: Number(raw["request_timeout_ms"]),
          maxDeliveryAttempts: Number(raw["max_delivery_attempts"]),
          matchEmailSha256: Boolean(raw["match_email_sha256"]),
          matchExternalIdSha256: Boolean(raw["match_external_id_sha256"]),
          matchGeo: Boolean(raw["match_geo"]),
          matchIpAddress: Boolean(raw["match_ip_address"]),
          matchUserAgent: Boolean(raw["match_user_agent"]),
          secretName: String(raw["secret_name"]),
          // Presence only. The value itself never crosses this boundary.
          secretPresent: Boolean(process.env[String(raw["secret_name"])]?.trim()),
          updatedAt: String(raw["updated_at"]),
        }
      : null;

    const rules: EventRuleView[] = (
      (rulesQuery.data ?? []) as unknown as Record<string, unknown>[]
    ).map((entry) => ({
      id: String(entry["id"]),
      eventType: String(entry["event_type"]),
      customEventName: (entry["custom_event_name"] as string | null) || null,
      enabled: Boolean(entry["enabled"]),
      browserEnabled: Boolean(entry["browser_enabled"]),
      capiEnabled: Boolean(entry["capi_enabled"]),
      actionSource: String(entry["action_source"]),
      successBoundary: String(entry["success_boundary"] ?? ""),
      dataShape:
        OPENAI_ADS_EVENT_DATA_SHAPE[
          String(entry["event_type"]) as keyof typeof OPENAI_ADS_EVENT_DATA_SHAPE
        ] ?? "custom",
    }));

    const deliveries: DeliveryView[] = (
      (deliveriesQuery.data ?? []) as unknown as Record<string, unknown>[]
    ).map((entry) => ({
      id: String(entry["id"]),
      eventType: String(entry["event_type"]),
      customEventName: (entry["custom_event_name"] as string | null) || null,
      eventId: String(entry["event_id"]),
      status: String(entry["status"]),
      validateOnly: Boolean(entry["validate_only"]),
      errorCategory: (entry["error_category"] as string | null) ?? null,
      httpStatus: (entry["http_status"] as number | null) ?? null,
      attemptCount: Number(entry["attempt_count"] ?? 0),
      lastAttemptAt: String(entry["last_attempt_at"]),
    }));

    const counts = {
      delivered: deliveries.filter((d) => d.status === "delivered").length,
      validated: deliveries.filter((d) => d.status === "validated").length,
      failed: deliveries.filter((d) => d.status === "failed").length,
      rejected: deliveries.filter((d) => d.status === "rejected").length,
    };

    return {
      connection,
      rules,
      deliveries,
      counts,
      canEdit: adminQuery.error ? false : Boolean(adminQuery.data),
    };
  });

/** Updates the tenant's sending configuration. Row-level rules restrict this to workspace admins. */
export const updateOpenAiAdsConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => connectionUpdateSchema.parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const update = await context.supabase
      .from("openai_ads_connections")
      .update({
        enabled: data.enabled,
        delivery_mode: data.deliveryMode,
        canonical_origin: data.canonicalOrigin,
        allowed_origins: data.allowedOrigins,
        request_timeout_ms: data.requestTimeoutMs,
        max_delivery_attempts: data.maxDeliveryAttempts,
        match_email_sha256: data.matchEmailSha256,
        match_external_id_sha256: data.matchExternalIdSha256,
        match_geo: data.matchGeo,
        match_ip_address: data.matchIpAddress,
        match_user_agent: data.matchUserAgent,
        updated_by: context.userId,
      })
      .eq("tenant_id", tenantId)
      .select("id");
    if (update.error) throw new Error(`Could not save the configuration: ${update.error.message}`);
    if (!update.data?.length) {
      throw new Error("You do not have permission to change this configuration.");
    }
    return { ok: true };
  });

/** Turns one conversion event on or off, per surface. */
export const updateOpenAiAdsEventRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => eventRuleUpdateSchema.parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const update = await context.supabase
      .from("openai_ads_event_rules")
      .update({
        enabled: data.enabled,
        browser_enabled: data.browserEnabled,
        capi_enabled: data.capiEnabled,
        action_source: data.actionSource,
        success_boundary: data.successBoundary,
        updated_by: context.userId,
      })
      .eq("tenant_id", tenantId)
      .eq("event_type", data.eventType)
      .eq("custom_event_name", data.customEventName ?? "")
      .select("id");
    if (update.error) throw new Error(`Could not save the event: ${update.error.message}`);
    if (!update.data?.length) {
      throw new Error("You do not have permission to change this event.");
    }
    return { ok: true };
  });
