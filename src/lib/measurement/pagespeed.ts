/**
 * Pure normalisation for PageSpeed Insights v5 responses.
 *
 * Nothing here calls a provider or a database, so the shape rules that decide
 * what AOOS is allowed to claim about a page are testable in isolation. A field
 * the provider did not return stays null. It is never defaulted to zero, because
 * a zero score and a missing score mean very different things to an operator.
 */

export type PageSpeedOpportunity = {
  id: string;
  title: string;
  description: string;
  savingsMs: number | null;
  savingsBytes: number | null;
  displayValue: string | null;
};

export type PageSpeedNormalized = {
  url: string;
  finalUrl: string | null;
  strategy: "mobile" | "desktop";
  lighthouseVersion: string | null;
  analysisTimestamp: string | null;
  performanceScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  clsValue: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndexMs: number | null;
  opportunities: PageSpeedOpportunity[];
  /** Categories or audits the provider did not return for this run. */
  missing: string[];
};

export class PageSpeedError extends Error {
  readonly httpStatus: number | null;
  constructor(message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "PageSpeedError";
    this.httpStatus = httpStatus;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Lighthouse category scores are 0..1 fractions. Operators read 0..100. */
function scoreOutOf100(category: unknown): number | null {
  const raw = finiteNumber(record(category)?.["score"]);
  if (raw === null) return null;
  return Math.round(raw * 100);
}

function auditNumeric(audits: Record<string, unknown> | null, key: string): number | null {
  return finiteNumber(record(audits?.[key])?.["numericValue"]);
}

function readOpportunities(audits: Record<string, unknown> | null): PageSpeedOpportunity[] {
  if (!audits) return [];
  const rows: PageSpeedOpportunity[] = [];
  for (const [id, value] of Object.entries(audits)) {
    const audit = record(value);
    if (!audit) continue;
    const details = record(audit["details"]);
    if (text(details?.["type"]) !== "opportunity") continue;

    const savingsMs = finiteNumber(details?.["overallSavingsMs"]);
    const savingsBytes = finiteNumber(details?.["overallSavingsBytes"]);
    // An "opportunity" with no estimated saving is not evidence of anything an
    // operator can act on, so it is dropped rather than shown as a zero win.
    if (savingsMs === null && savingsBytes === null) continue;
    if ((savingsMs ?? 0) <= 0 && (savingsBytes ?? 0) <= 0) continue;

    rows.push({
      id,
      title: text(audit["title"]) ?? id,
      description: text(audit["description"]) ?? "",
      savingsMs,
      savingsBytes,
      displayValue: text(audit["displayValue"]),
    });
  }
  return rows.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0));
}

/**
 * Turns a raw v5 payload into the stored snapshot shape. Throws when the payload
 * carries a provider error or is not a Lighthouse result at all, so a failed call
 * can never be persisted as a successful measurement.
 */
export function normalizePageSpeed(
  payload: unknown,
  fallback: { url: string; strategy: "mobile" | "desktop" },
): PageSpeedNormalized {
  const root = record(payload);
  if (!root) throw new PageSpeedError("PageSpeed returned a response that was not an object.");

  const providerError = record(root["error"]);
  if (providerError) {
    const message =
      text(providerError["message"]) ?? "PageSpeed reported an error without a message.";
    throw new PageSpeedError(message, finiteNumber(providerError["code"]));
  }

  const lighthouse = record(root["lighthouseResult"]);
  if (!lighthouse) {
    throw new PageSpeedError("PageSpeed returned no Lighthouse result for this URL.");
  }

  const runtimeError = record(lighthouse["runtimeError"]);
  const runtimeCode = text(runtimeError?.["code"]);
  if (runtimeCode && runtimeCode !== "NO_ERROR") {
    throw new PageSpeedError(
      text(runtimeError?.["message"]) ?? `Lighthouse could not analyse the page (${runtimeCode}).`,
    );
  }

  const categories = record(lighthouse["categories"]);
  const audits = record(lighthouse["audits"]);

  const performanceScore = scoreOutOf100(categories?.["performance"]);
  const seoScore = scoreOutOf100(categories?.["seo"]);
  const lcpMs = auditNumeric(audits, "largest-contentful-paint");
  const clsValue = auditNumeric(audits, "cumulative-layout-shift");
  const tbtMs = auditNumeric(audits, "total-blocking-time");
  const fcpMs = auditNumeric(audits, "first-contentful-paint");
  const speedIndexMs = auditNumeric(audits, "speed-index");

  const missing: string[] = [];
  const track = (label: string, value: number | null) => {
    if (value === null) missing.push(label);
  };
  track("Performance score", performanceScore);
  track("SEO score", seoScore);
  track("LCP", lcpMs);
  track("CLS", clsValue);
  track("TBT", tbtMs);
  track("FCP", fcpMs);
  track("Speed Index", speedIndexMs);

  return {
    url: text(root["id"]) ?? fallback.url,
    finalUrl: text(lighthouse["finalUrl"]) ?? text(lighthouse["finalDisplayedUrl"]),
    strategy: fallback.strategy,
    lighthouseVersion: text(lighthouse["lighthouseVersion"]),
    analysisTimestamp: text(lighthouse["fetchTime"]),
    performanceScore,
    seoScore,
    lcpMs,
    clsValue,
    tbtMs,
    fcpMs,
    speedIndexMs,
    opportunities: readOpportunities(audits),
    missing,
  };
}

/** A run is only fully successful when every headline fact came back. */
export function runStatusFor(result: PageSpeedNormalized): "succeeded" | "partial" {
  return result.missing.length === 0 ? "succeeded" : "partial";
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Owned-target guard: only URLs on an owned host may be measured. */
export function assertOwnedTarget(rawUrl: string, ownedHosts: string[]): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new PageSpeedError(`"${rawUrl}" is not a valid URL.`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new PageSpeedError("Only http and https URLs can be measured.");
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const owned = ownedHosts.map((value) => value.replace(/^www\./, "").toLowerCase());
  if (!owned.includes(host)) {
    throw new PageSpeedError(
      `${parsed.hostname} is not an owned site in this workspace, so AOOS will not measure it.`,
    );
  }
  return parsed.toString();
}

/**
 * Empty state for the latest snapshot slot. Failed attempts are stored runs,
 * so the copy must never claim nothing has been run.
 */
export function describeMissingSnapshot(
  runs: { status: string; error: string | null; startedAt: string }[],
): { title: string; description: string } {
  if (runs.length === 0) {
    return {
      title: "No PageSpeed run attempted yet",
      description:
        "Nothing is shown until a real request returns. AOOS does not seed or estimate Lighthouse figures.",
    };
  }
  const failed = runs.filter((run) => run.status !== "succeeded");
  const latestError = failed[0]?.error ?? runs[0]?.error ?? null;
  return {
    title: "No successful PageSpeed snapshot yet",
    description: `${runs.length} run attempt(s) are recorded below and ${failed.length} failed, so there is no measurement to show. A failed attempt is a stored run, not a result. Latest provider error: ${latestError ?? "not recorded"}.`,
  };
}
