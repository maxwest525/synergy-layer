/**
 * Server-side OpenAI Ads Conversions API sender.
 *
 * AOOS is the only sender. The website reports what happened; AOOS decides
 * whether that event is configured, whether it is allowed, and whether it was
 * actually delivered. The provider credential is read from the server
 * environment inside this module and never leaves it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkConversion,
  conversionRequestSchema,
  hasForbiddenUserFields,
  toProviderConversion,
  type ConversionInput,
  type ConversionRules,
} from "./capi-contract";
import {
  categorizeHttpStatus,
  categorizeTransportError,
  isRetryableCategory,
  providerEndpoint,
  retryDelayMs,
  summarizeResults,
  type ConversionResult,
  type DeliveryErrorCategory,
  type DeliveryStatus,
} from "./capi-delivery";

type Admin = SupabaseClient;

export type ConnectionRow = {
  id: string;
  tenant_id: string;
  enabled: boolean;
  pixel_id: string;
  source_project: string;
  canonical_origin: string;
  allowed_origins: string[];
  delivery_mode: "disabled" | "validate_only" | "live";
  request_timeout_ms: number;
  max_delivery_attempts: number;
  match_email_sha256: boolean;
  match_external_id_sha256: boolean;
  match_geo: boolean;
  match_ip_address: boolean;
  match_user_agent: boolean;
  secret_name: string;
};

export type EventRuleRow = {
  event_type: string;
  custom_event_name: string | null;
  enabled: boolean;
  browser_enabled: boolean;
  capi_enabled: boolean;
  action_source: string;
  success_boundary: string;
};

export type DeliveryOutcome =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      results: ConversionResult[];
      summary: ReturnType<typeof summarizeResults>;
      validateOnly: boolean;
    };

function ruleKey(eventType: string, customName: string | null): string {
  return `${eventType}::${customName ?? ""}`;
}

function result(
  input: ConversionInput,
  status: DeliveryStatus,
  errorCategory: DeliveryErrorCategory,
  detail: string,
  httpStatus: number | null = null,
  attemptCount = 0,
): ConversionResult {
  return {
    eventId: input.event_id,
    eventType: input.event_type,
    customEventName: input.custom_event_name ?? null,
    status,
    errorCategory,
    httpStatus,
    attemptCount,
    detail,
  };
}

async function postToProvider(
  connection: ConnectionRow,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ httpStatus: number | null; category: DeliveryErrorCategory }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), connection.request_timeout_ms);
  try {
    const response = await fetch(providerEndpoint(connection.pixel_id), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { httpStatus: response.status, category: categorizeHttpStatus(response.status) };
  } catch (error) {
    return { httpStatus: null, category: categorizeTransportError(error) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Delivers one batch. Every conversion is decided independently so a single bad
 * event never discards a good one.
 */
export async function deliverConversions(admin: Admin, rawBody: unknown): Promise<DeliveryOutcome> {
  const parsed = conversionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Invalid conversion request" };
  }
  const payload = parsed.data;

  const rawConversions = (rawBody as { conversions?: unknown[] }).conversions ?? [];
  const forbidden = rawConversions.some(
    (item) => hasForbiddenUserFields((item as { user?: unknown })?.user).length > 0,
  );
  if (forbidden) {
    return { ok: false, status: 422, error: "Raw identifiers are not accepted" };
  }

  const tenant = await admin
    .from("tenants")
    .select("id")
    .eq("slug", payload.tenant_slug)
    .maybeSingle();
  if (tenant.error) return { ok: false, status: 500, error: "Tenant lookup failed" };
  if (!tenant.data) return { ok: false, status: 404, error: "Unknown tenant" };
  const tenantId = (tenant.data as { id: string }).id;

  const connectionQuery = await admin
    .from("openai_ads_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("pixel_id", payload.pixel_id)
    .maybeSingle();
  if (connectionQuery.error)
    return { ok: false, status: 500, error: "Configuration lookup failed" };
  if (!connectionQuery.data) {
    return { ok: false, status: 404, error: "No configuration for this pixel" };
  }
  const connection = connectionQuery.data as unknown as ConnectionRow;

  const apiKey = process.env[connection.secret_name]?.trim();
  const rulesQuery = await admin
    .from("openai_ads_event_rules")
    .select(
      "event_type, custom_event_name, enabled, browser_enabled, capi_enabled, action_source, success_boundary",
    )
    .eq("tenant_id", tenantId);
  if (rulesQuery.error) return { ok: false, status: 500, error: "Event rule lookup failed" };
  const rules = new Map<string, EventRuleRow>();
  for (const row of (rulesQuery.data ?? []) as unknown as EventRuleRow[]) {
    rules.set(ruleKey(row.event_type, row.custom_event_name), row);
  }

  const validateOnly = connection.delivery_mode === "validate_only";
  const checkRules: ConversionRules = {
    allowedOrigins: connection.allowed_origins.map((origin) => origin.toLowerCase()),
    now: Date.now(),
    match: {
      emailSha256: connection.match_email_sha256,
      externalIdSha256: connection.match_external_id_sha256,
      geo: connection.match_geo,
      ipAddress: connection.match_ip_address,
      userAgent: connection.match_user_agent,
    },
  };

  const results: ConversionResult[] = [];

  for (const input of payload.conversions) {
    if (!connection.enabled || connection.delivery_mode === "disabled") {
      results.push(result(input, "skipped", "not_configured", "Server-side sending is turned off"));
      continue;
    }

    const rule =
      rules.get(ruleKey(input.event_type, input.custom_event_name ?? null)) ??
      (input.event_type === "custom" ? undefined : rules.get(ruleKey(input.event_type, null)));
    if (!rule || !rule.enabled || !rule.capi_enabled) {
      results.push(
        result(
          input,
          "skipped",
          "not_configured",
          "This event is not enabled for server-side sending",
        ),
      );
      continue;
    }

    const check = checkConversion(input, checkRules);
    if (!check.ok) {
      const detail = check.rejections.map((r) => `${r.field}: ${r.reason}`).join("; ");
      results.push(result(input, "rejected", "schema", detail));
      continue;
    }
    const conversion = check.conversion;

    const existing = await admin
      .from("openai_ads_deliveries")
      .select("status")
      .eq("tenant_id", tenantId)
      .eq("pixel_id", connection.pixel_id)
      .eq("event_type", conversion.eventType)
      .eq("custom_event_name", conversion.customEventName ?? "")
      .eq("event_id", conversion.eventId)
      .maybeSingle();
    const priorStatus = (existing.data as { status?: string } | null)?.status;
    if (priorStatus === "delivered" || priorStatus === "validated") {
      results.push(result(input, priorStatus as DeliveryStatus, "duplicate", "Already sent once"));
      continue;
    }

    if (!apiKey) {
      results.push(
        result(
          input,
          "skipped",
          "not_configured",
          "The provider credential is not present on the server",
        ),
      );
      continue;
    }

    const body = {
      pixel_id: connection.pixel_id,
      test_mode: validateOnly,
      events: [toProviderConversion(conversion)],
    };

    let attempt = 0;
    let httpStatus: number | null = null;
    let category: DeliveryErrorCategory = null;
    while (attempt < connection.max_delivery_attempts) {
      attempt += 1;
      const attemptResult = await postToProvider(connection, apiKey, body);
      httpStatus = attemptResult.httpStatus;
      category = attemptResult.category;
      if (category === null) break;
      if (!isRetryableCategory(category) || attempt >= connection.max_delivery_attempts) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(attempt)));
    }

    const status: DeliveryStatus =
      category === null ? (validateOnly ? "validated" : "delivered") : "failed";
    const detail =
      category === null
        ? validateOnly
          ? "Accepted by the provider in validation mode"
          : "Delivered to the provider"
        : `Delivery failed (${category})`;

    await admin.from("openai_ads_deliveries").upsert(
      [
        {
          tenant_id: tenantId,
          pixel_id: connection.pixel_id,
          event_type: conversion.eventType,
          custom_event_name: conversion.customEventName ?? "",
          event_id: conversion.eventId,
          status,
          validate_only: validateOnly,
          error_category: category,
          http_status: httpStatus,
          attempt_count: attempt,
          last_attempt_at: new Date().toISOString(),
        },
      ],
      { onConflict: "tenant_id,pixel_id,event_type,custom_event_name,event_id" },
    );

    results.push(result(input, status, category, detail, httpStatus, attempt));
  }

  return { ok: true, results, summary: summarizeResults(results), validateOnly };
}
