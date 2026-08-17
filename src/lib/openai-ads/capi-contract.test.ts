import { describe, expect, it } from "vitest";

import {
  checkConversion,
  conversionRequestSchema,
  hasForbiddenUserFields,
  sanitizeSourceUrl,
  toProviderConversion,
  type ConversionInput,
  type ConversionRules,
} from "./capi-contract";
import {
  categorizeHttpStatus,
  categorizeTransportError,
  isRetryableCategory,
  redactForLog,
  summarizeResults,
  type ConversionResult,
} from "./capi-delivery";

const NOW = Date.UTC(2026, 7, 17, 12, 0, 0);

const rules: ConversionRules = {
  allowedOrigins: ["https://trumoveinc.com"],
  now: NOW,
  match: {
    emailSha256: true,
    externalIdSha256: true,
    geo: true,
    ipAddress: false,
    userAgent: true,
  },
};

function lead(overrides: Partial<ConversionInput> = {}): ConversionInput {
  return {
    event_type: "lead_created",
    event_id: "lead-1",
    timestamp_ms: NOW - 1000,
    action_source: "web",
    source_url: "https://trumoveinc.com/quote?utm_source=x#form",
    data: { type: "customer_action" },
    user: { email_sha256: "a".repeat(64), ip_address: "203.0.113.4" },
    ...overrides,
  };
}

describe("conversion contract", () => {
  it("accepts a well formed web lead and strips query and fragment", () => {
    const check = checkConversion(lead(), rules);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.conversion.sourceUrl).toBe("https://trumoveinc.com/quote");
  });

  it("drops identifiers the tenant did not enable", () => {
    const check = checkConversion(lead(), rules);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.conversion.user?.ip_address).toBeUndefined();
    expect(check.conversion.user?.email_sha256).toBeDefined();
  });

  it("refuses an origin outside the allowlist", () => {
    const check = checkConversion(lead({ source_url: "https://evil.example/quote" }), rules);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.rejections.some((r) => r.field === "source_url")).toBe(true);
  });

  it("refuses a mismatched data shape", () => {
    const check = checkConversion(
      lead({ event_type: "order_created", data: { type: "customer_action" } }),
      rules,
    );
    expect(check.ok).toBe(false);
  });

  it("requires contents for a contents event", () => {
    const check = checkConversion(
      lead({ event_type: "order_created", data: { type: "contents" } }),
      rules,
    );
    expect(check.ok).toBe(false);
  });

  it("requires a plan id for plan enrollment", () => {
    const check = checkConversion(
      lead({ event_type: "trial_started", data: { type: "plan_enrollment" } }),
      rules,
    );
    expect(check.ok).toBe(false);
  });

  it("refuses stale and future timestamps", () => {
    expect(checkConversion(lead({ timestamp_ms: NOW - 8 * 86400000 }), rules).ok).toBe(false);
    expect(checkConversion(lead({ timestamp_ms: NOW + 3600000 }), rules).ok).toBe(false);
  });

  it("requires a custom name only for custom events", () => {
    expect(
      checkConversion(
        lead({ event_type: "custom", data: { type: "custom", custom: { a: "b" } } }),
        rules,
      ).ok,
    ).toBe(false);
    expect(
      checkConversion(
        lead({
          event_type: "custom",
          custom_event_name: "survey_completed",
          data: { type: "custom", custom: { a: "b" } },
        }),
        rules,
      ).ok,
    ).toBe(true);
    expect(checkConversion(lead({ custom_event_name: "nope" }), rules).ok).toBe(false);
  });

  it("refuses a custom name that shadows a standard event", () => {
    const check = checkConversion(
      lead({
        event_type: "custom",
        custom_event_name: "page_viewed",
        data: { type: "custom", custom: { a: "b" } },
      }),
      rules,
    );
    expect(check.ok).toBe(false);
  });

  it("rejects raw identifier fields at the schema boundary", () => {
    const raw = { ...lead(), user: { email: "a@b.com" } };
    expect(hasForbiddenUserFields(raw.user)).toContain("email");
    expect(conversionRequestSchema.safeParse({
      version: 1,
      tenant_slug: "trumove",
      pixel_id: "pixel",
      conversions: [raw],
    }).success).toBe(false);
  });

  it("rejects a malformed hash", () => {
    const parsed = conversionRequestSchema.safeParse({
      version: 1,
      tenant_slug: "trumove",
      pixel_id: "pixel",
      conversions: [{ ...lead(), user: { email_sha256: "short" } }],
    });
    expect(parsed.success).toBe(false);
  });

  it("only accepts absolute http(s) source urls", () => {
    expect(sanitizeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeSourceUrl("/quote")).toBeNull();
    expect(sanitizeSourceUrl("https://trumoveinc.com/a?b=1")?.url).toBe("https://trumoveinc.com/a");
  });

  it("carries the ad click reference through untouched", () => {
    const check = checkConversion(lead({ oppref: "abc123" }), rules);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(toProviderConversion(check.conversion)["oppref"]).toBe("abc123");
  });
});

describe("delivery semantics", () => {
  it("retries only transient conditions", () => {
    expect(isRetryableCategory(categorizeHttpStatus(500))).toBe(true);
    expect(isRetryableCategory(categorizeHttpStatus(429))).toBe(true);
    expect(isRetryableCategory(categorizeHttpStatus(400))).toBe(false);
    expect(isRetryableCategory(categorizeHttpStatus(401))).toBe(false);
    expect(categorizeHttpStatus(204)).toBeNull();
  });

  it("classifies aborts as timeouts", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(categorizeTransportError(abort)).toBe("timeout");
    expect(categorizeTransportError(new Error("socket hang up"))).toBe("network");
  });

  it("redacts identifiers and the ad click reference from log output", () => {
    const redacted = redactForLog({
      event_id: "e1",
      oppref: "abc",
      user: { email_sha256: "x", city: "Denver" },
    }) as Record<string, unknown>;
    expect(redacted["oppref"]).toBe("[redacted]");
    expect((redacted["user"] as Record<string, unknown>)["email_sha256"]).toBe("[redacted]");
    expect(redacted["event_id"]).toBe("e1");
  });

  it("advertises fallback only when AOOS did not deliver", () => {
    const base: ConversionResult = {
      eventId: "1",
      eventType: "lead_created",
      customEventName: null,
      status: "delivered",
      errorCategory: null,
      httpStatus: 200,
      attemptCount: 1,
      detail: "",
    };
    expect(summarizeResults([base]).websiteShouldFallback).toBe(false);
    expect(
      summarizeResults([{ ...base, status: "failed", errorCategory: "network" }])
        .websiteShouldFallback,
    ).toBe(true);
    expect(
      summarizeResults([{ ...base, status: "rejected", errorCategory: "schema" }])
        .websiteShouldFallback,
    ).toBe(false);
  });
});
