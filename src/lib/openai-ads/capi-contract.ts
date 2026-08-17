/**
 * OpenAI Ads Conversions API request contract.
 *
 * Pure, dependency-free validation so the exact same rules can be unit tested
 * and reused by the public hook. Nothing here performs network I/O, reads a
 * secret, or logs a payload.
 */
import { z } from "zod";

export const OPENAI_ADS_STANDARD_EVENTS = [
  "page_viewed",
  "contents_viewed",
  "items_added",
  "checkout_started",
  "order_created",
  "lead_created",
  "registration_completed",
  "appointment_scheduled",
  "subscription_created",
  "trial_started",
] as const;

export type OpenAiAdsStandardEvent = (typeof OPENAI_ADS_STANDARD_EVENTS)[number];

export const OPENAI_ADS_EVENT_TYPES = [...OPENAI_ADS_STANDARD_EVENTS, "custom"] as const;
export type OpenAiAdsEventType = (typeof OPENAI_ADS_EVENT_TYPES)[number];

export const OPENAI_ADS_ACTION_SOURCES = [
  "web",
  "mobile_app",
  "offline",
  "physical_store",
  "phone_call",
  "email",
  "other",
] as const;
export type OpenAiAdsActionSource = (typeof OPENAI_ADS_ACTION_SOURCES)[number];

export const OPENAI_ADS_DATA_SHAPES = [
  "contents",
  "customer_action",
  "plan_enrollment",
  "custom",
] as const;
export type OpenAiAdsDataShape = (typeof OPENAI_ADS_DATA_SHAPES)[number];

/** The provider pairs each event type with exactly one data shape. */
export const OPENAI_ADS_EVENT_DATA_SHAPE: Record<OpenAiAdsEventType, OpenAiAdsDataShape> = {
  page_viewed: "customer_action",
  contents_viewed: "contents",
  items_added: "contents",
  checkout_started: "contents",
  order_created: "contents",
  lead_created: "customer_action",
  registration_completed: "customer_action",
  appointment_scheduled: "customer_action",
  subscription_created: "plan_enrollment",
  trial_started: "plan_enrollment",
  custom: "custom",
};

/** Identifier fields AOOS refuses outright, so raw PII cannot reach a provider. */
export const OPENAI_ADS_FORBIDDEN_USER_FIELDS = [
  "email",
  "email_address",
  "external_id",
  "phone",
  "phone_number",
  "phone_sha256",
  "phone_e164",
] as const;

export const OPENAI_ADS_MAX_CONVERSIONS = 200;
export const OPENAI_ADS_MAX_TIMESTAMP_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const OPENAI_ADS_MAX_TIMESTAMP_FUTURE_MS = 10 * 60 * 1000;

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "must be lowercase 64 character sha-256 hex");
const currencyCode = z.string().regex(/^[A-Z]{3}$/, "must be an ISO 4217 uppercase code");
const integerAmount = z.number().int().nonnegative();

const contentItemSchema = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(300).optional(),
    content_type: z.string().min(1).max(100).optional(),
    quantity: z.number().int().positive().max(100000).optional(),
    amount: integerAmount.optional(),
    currency: currencyCode.optional(),
  })
  .strict();

const dataSchema = z
  .object({
    type: z.enum(OPENAI_ADS_DATA_SHAPES),
    amount: integerAmount.optional(),
    currency: currencyCode.optional(),
    plan_id: z.string().min(1).max(200).optional(),
    contents: z.array(contentItemSchema).min(1).max(100).optional(),
    custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

const userSchema = z
  .object({
    email_sha256: sha256Hex.optional(),
    external_id_sha256: sha256Hex.optional(),
    country: z.string().length(2).optional(),
    city: z.string().min(1).max(120).optional(),
    zip_code: z.string().min(1).max(20).optional(),
    ip_address: z.string().min(3).max(64).optional(),
    user_agent: z.string().min(1).max(1000).optional(),
  })
  .strict();

const conversionSchema = z
  .object({
    event_type: z.enum(OPENAI_ADS_EVENT_TYPES),
    custom_event_name: z.string().min(1).max(64).optional(),
    event_id: z.string().min(1).max(200),
    timestamp_ms: z.number().int().positive(),
    oppref: z.string().min(1).max(1000).optional(),
    action_source: z.enum(OPENAI_ADS_ACTION_SOURCES),
    source_url: z.string().min(1).max(2000).optional(),
    opt_out: z.boolean().optional(),
    data: dataSchema,
    user: userSchema.optional(),
  })
  .strict();

export const conversionRequestSchema = z
  .object({
    version: z.literal(1),
    tenant_slug: z.string().min(1).max(120),
    pixel_id: z.string().min(1).max(120),
    conversions: z.array(conversionSchema).min(1).max(OPENAI_ADS_MAX_CONVERSIONS),
  })
  .strict();

export type ConversionInput = z.infer<typeof conversionSchema>;
export type ConversionRequest = z.infer<typeof conversionRequestSchema>;

export type ConversionRejection = { field: string; reason: string };

export type NormalizedConversion = {
  eventType: OpenAiAdsEventType;
  customEventName: string | null;
  eventId: string;
  timestampMs: number;
  actionSource: OpenAiAdsActionSource;
  sourceUrl: string | null;
  optOut: boolean;
  oppref: string | null;
  data: ConversionInput["data"];
  user: ConversionInput["user"];
};

export type ConversionCheck =
  { ok: true; conversion: NormalizedConversion } | { ok: false; rejections: ConversionRejection[] };

export type ConversionRules = {
  allowedOrigins: readonly string[];
  now: number;
  match: {
    emailSha256: boolean;
    externalIdSha256: boolean;
    geo: boolean;
    ipAddress: boolean;
    userAgent: boolean;
  };
};

/** Strips query and fragment; anything that is not http(s) is refused. */
export function sanitizeSourceUrl(raw: string): { url: string; origin: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  parsed.search = "";
  parsed.hash = "";
  return { url: parsed.toString(), origin: parsed.origin };
}

/** True when the raw object carries an identifier field AOOS refuses to relay. */
export function hasForbiddenUserFields(user: unknown): string[] {
  if (!user || typeof user !== "object") return [];
  return OPENAI_ADS_FORBIDDEN_USER_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(user, field),
  );
}

function checkTimestamp(timestampMs: number, now: number): ConversionRejection | null {
  if (timestampMs > now + OPENAI_ADS_MAX_TIMESTAMP_FUTURE_MS) {
    return { field: "timestamp_ms", reason: "more than 10 minutes in the future" };
  }
  if (timestampMs < now - OPENAI_ADS_MAX_TIMESTAMP_AGE_MS) {
    return { field: "timestamp_ms", reason: "older than 7 days" };
  }
  return null;
}

function checkDataPairing(input: ConversionInput): ConversionRejection[] {
  const rejections: ConversionRejection[] = [];
  const expected = OPENAI_ADS_EVENT_DATA_SHAPE[input.event_type];
  if (input.data.type !== expected) {
    rejections.push({
      field: "data.type",
      reason: `${input.event_type} requires the ${expected} data shape`,
    });
    return rejections;
  }

  if (expected === "contents") {
    if (!input.data.contents?.length) {
      rejections.push({ field: "data.contents", reason: "at least one content item is required" });
    }
    if (input.data.amount !== undefined && !input.data.currency) {
      rejections.push({ field: "data.currency", reason: "an amount requires a currency" });
    }
  }
  if (expected === "plan_enrollment" && !input.data.plan_id) {
    rejections.push({ field: "data.plan_id", reason: "plan enrollment requires a plan id" });
  }
  if (expected === "custom" && !input.data.custom) {
    rejections.push({ field: "data.custom", reason: "custom events require a custom data object" });
  }
  if (expected !== "contents" && input.data.contents) {
    rejections.push({ field: "data.contents", reason: "contents is not allowed for this event" });
  }
  if (expected !== "plan_enrollment" && input.data.plan_id) {
    rejections.push({ field: "data.plan_id", reason: "plan_id is not allowed for this event" });
  }
  return rejections;
}

function checkCustomName(input: ConversionInput): ConversionRejection[] {
  const rejections: ConversionRejection[] = [];
  if (input.event_type === "custom") {
    const name = input.custom_event_name;
    if (!name) {
      rejections.push({
        field: "custom_event_name",
        reason: "a custom event requires a custom_event_name",
      });
    } else if (!/^[a-z0-9_]{1,64}$/.test(name)) {
      rejections.push({
        field: "custom_event_name",
        reason: "only lowercase letters, digits, and underscores are allowed",
      });
    } else if ((OPENAI_ADS_STANDARD_EVENTS as readonly string[]).includes(name)) {
      rejections.push({
        field: "custom_event_name",
        reason: "a custom event may not reuse a standard event name",
      });
    }
  } else if (input.custom_event_name) {
    rejections.push({
      field: "custom_event_name",
      reason: "custom_event_name is only valid for custom events",
    });
  }
  return rejections;
}

/**
 * Applies every documented rule to one already-parsed conversion and returns
 * either the normalized conversion or the exact reasons it was refused.
 */
export function checkConversion(input: ConversionInput, rules: ConversionRules): ConversionCheck {
  const rejections: ConversionRejection[] = [...checkCustomName(input), ...checkDataPairing(input)];

  const timestampProblem = checkTimestamp(input.timestamp_ms, rules.now);
  if (timestampProblem) rejections.push(timestampProblem);

  let sourceUrl: string | null = null;
  if (input.source_url) {
    const sanitized = sanitizeSourceUrl(input.source_url);
    if (!sanitized) {
      rejections.push({ field: "source_url", reason: "must be an absolute http(s) URL" });
    } else {
      sourceUrl = sanitized.url;
      if (
        input.action_source === "web" &&
        !rules.allowedOrigins.includes(sanitized.origin.toLowerCase())
      ) {
        rejections.push({ field: "source_url", reason: "origin is not in the allowlist" });
      }
    }
  } else if (input.action_source === "web") {
    rejections.push({ field: "source_url", reason: "web events require a source_url" });
  }

  if (rejections.length > 0) return { ok: false, rejections };

  const user = input.user ? { ...input.user } : undefined;
  if (user) {
    if (!rules.match.emailSha256) delete user.email_sha256;
    if (!rules.match.externalIdSha256) delete user.external_id_sha256;
    if (!rules.match.geo) {
      delete user.country;
      delete user.city;
      delete user.zip_code;
    }
    if (!rules.match.ipAddress) delete user.ip_address;
    if (!rules.match.userAgent) delete user.user_agent;
  }

  return {
    ok: true,
    conversion: {
      eventType: input.event_type,
      customEventName: input.custom_event_name ?? null,
      eventId: input.event_id,
      timestampMs: input.timestamp_ms,
      actionSource: input.action_source,
      sourceUrl,
      optOut: input.opt_out ?? false,
      // Never decoded, never normalized, never logged.
      oppref: input.oppref ?? null,
      data: input.data,
      user: user && Object.keys(user).length > 0 ? user : undefined,
    },
  };
}

/** Provider payload for one normalized conversion. */
export function toProviderConversion(conversion: NormalizedConversion): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    event_type: conversion.eventType,
    event_id: conversion.eventId,
    timestamp: conversion.timestampMs,
    action_source: conversion.actionSource,
    data: conversion.data,
  };
  if (conversion.customEventName) payload["custom_event_name"] = conversion.customEventName;
  if (conversion.sourceUrl) payload["source_url"] = conversion.sourceUrl;
  if (conversion.optOut) payload["opt_out"] = true;
  if (conversion.oppref) payload["oppref"] = conversion.oppref;
  if (conversion.user) payload["user"] = conversion.user;
  return payload;
}
