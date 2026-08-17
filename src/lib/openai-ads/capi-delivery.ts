/**
 * Delivery semantics for the server-side conversions path: what the website is
 * told, what is worth retrying, and what may be written to a log line.
 *
 * Pure functions only. Nothing here holds a secret or performs I/O.
 */

export const OPENAI_ADS_PROVIDER_ENDPOINT = "https://bzr.openai.com/v1/events";

export type DeliveryStatus = "delivered" | "validated" | "skipped" | "rejected" | "failed";

export type DeliveryErrorCategory =
  | "network"
  | "timeout"
  | "rate_limited"
  | "provider_error"
  | "auth"
  | "schema"
  | "not_configured"
  | "duplicate"
  | null;

export type DeliveryRecord = {
  eventType: string;
  customEventName: string | null;
  eventId: string;
  status: DeliveryStatus;
  validateOnly: boolean;
  errorCategory: DeliveryErrorCategory;
  httpStatus: number | null;
  attemptCount: number;
};

export function providerEndpoint(pixelId: string): string {
  return `${OPENAI_ADS_PROVIDER_ENDPOINT}?pid=${encodeURIComponent(pixelId)}`;
}

/**
 * Only transient conditions are retried, and always with the same event id so a
 * retry can never become a second conversion.
 */
export function isRetryableCategory(category: DeliveryErrorCategory): boolean {
  return category === "network" || category === "timeout" || category === "rate_limited"
    ? true
    : category === "provider_error";
}

export function categorizeHttpStatus(status: number): DeliveryErrorCategory {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  if (status >= 400) return "schema";
  return null;
}

export function categorizeTransportError(error: unknown): DeliveryErrorCategory {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (name === "AbortError" || name === "TimeoutError" || message.includes("timeout")) {
    return "timeout";
  }
  return "network";
}

/** Delay before the next attempt. Bounded so a request cannot hang the caller. */
export function retryDelayMs(attempt: number): number {
  return Math.min(2000, 250 * 2 ** Math.max(0, attempt - 1));
}

const SENSITIVE_KEY =
  /(email|phone|external_id|oppref|ip_address|user_agent|authorization|key|secret|token)/i;

/**
 * Log-safe view of anything derived from a payload. User identifiers and the ad
 * click reference are removed rather than truncated, so they cannot be
 * reconstructed from logs.
 */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactForLog(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactForLog(entry, depth + 1);
    }
    return output;
  }
  return value;
}

export type ConversionResult = {
  eventId: string;
  eventType: string;
  customEventName: string | null;
  status: DeliveryStatus;
  errorCategory: DeliveryErrorCategory;
  httpStatus: number | null;
  attemptCount: number;
  detail: string;
};

/** Machine-readable summary the website uses to decide on its own fallback. */
export function summarizeResults(results: readonly ConversionResult[]): {
  delivered: number;
  validated: number;
  skipped: number;
  rejected: number;
  failed: number;
  websiteShouldFallback: boolean;
} {
  const count = (status: DeliveryStatus) => results.filter((r) => r.status === status).length;
  const failed = count("failed");
  const skipped = count("skipped");
  return {
    delivered: count("delivered"),
    validated: count("validated"),
    skipped,
    rejected: count("rejected"),
    failed,
    // Fallback is only advertised where AOOS provably did not deliver.
    websiteShouldFallback: failed + skipped > 0,
  };
}
