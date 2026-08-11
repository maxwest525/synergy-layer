import { describe, expect, it } from "vitest";

import {
  assertOwnedTarget,
  normalizePageSpeed,
  PageSpeedError,
  runStatusFor,
} from "./measurement/pagespeed";
import { describeGa4Connection, ga4Window, readGa4EnvPresence } from "./measurement/ga4";

function lighthousePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "https://trumoveinc.com/",
    lighthouseResult: {
      finalUrl: "https://trumoveinc.com/",
      lighthouseVersion: "12.0.0",
      fetchTime: "2026-08-11T18:00:00.000Z",
      categories: { performance: { score: 0.42 }, seo: { score: 0.91 } },
      audits: {
        "largest-contentful-paint": { numericValue: 4321 },
        "cumulative-layout-shift": { numericValue: 0.08 },
        "total-blocking-time": { numericValue: 610 },
        "first-contentful-paint": { numericValue: 1800 },
        "speed-index": { numericValue: 5200 },
        "unused-javascript": {
          title: "Reduce unused JavaScript",
          description: "Remove dead code.",
          displayValue: "Potential savings of 120 KiB",
          details: { type: "opportunity", overallSavingsMs: 900, overallSavingsBytes: 122880 },
        },
        "render-blocking-resources": {
          title: "Eliminate render blocking resources",
          description: "Defer non critical CSS.",
          details: { type: "opportunity", overallSavingsMs: 240 },
        },
        "noop-opportunity": {
          title: "Nothing to gain",
          details: { type: "opportunity", overallSavingsMs: 0, overallSavingsBytes: 0 },
        },
        "not-an-opportunity": { title: "Diagnostic", details: { type: "table" } },
      },
      ...overrides,
    },
  };
}

describe("normalizePageSpeed", () => {
  it("normalises scores, metrics, and ranked opportunities", () => {
    const result = normalizePageSpeed(lighthousePayload(), {
      url: "https://trumoveinc.com",
      strategy: "mobile",
    });

    expect(result.performanceScore).toBe(42);
    expect(result.seoScore).toBe(91);
    expect(result.lcpMs).toBe(4321);
    expect(result.clsValue).toBe(0.08);
    expect(result.tbtMs).toBe(610);
    expect(result.fcpMs).toBe(1800);
    expect(result.speedIndexMs).toBe(5200);
    expect(result.strategy).toBe("mobile");
    expect(result.opportunities.map((row) => row.id)).toEqual([
      "unused-javascript",
      "render-blocking-resources",
    ]);
    expect(result.opportunities[0]?.savingsBytes).toBe(122880);
    expect(result.missing).toEqual([]);
    expect(runStatusFor(result)).toBe("succeeded");
  });

  it("reports missing facts as null and marks the run partial", () => {
    const payload = lighthousePayload({
      categories: { performance: { score: 0.5 } },
      audits: { "largest-contentful-paint": { numericValue: 3000 } },
    });
    const result = normalizePageSpeed(payload, { url: "https://trumoveinc.com", strategy: "desktop" });

    expect(result.seoScore).toBeNull();
    expect(result.clsValue).toBeNull();
    expect(result.missing).toContain("SEO score");
    expect(result.missing).toContain("CLS");
    expect(runStatusFor(result)).toBe("partial");
  });

  it("throws on a provider error payload instead of storing a success", () => {
    expect(() =>
      normalizePageSpeed({ error: { code: 429, message: "Quota exceeded" } }, {
        url: "https://trumoveinc.com",
        strategy: "mobile",
      }),
    ).toThrow(/Quota exceeded/);
  });

  it("throws on a Lighthouse runtime error", () => {
    const payload = lighthousePayload({ runtimeError: { code: "ERRORED_DOCUMENT_REQUEST", message: "DNS failure" } });
    expect(() => normalizePageSpeed(payload, { url: "https://trumoveinc.com", strategy: "mobile" })).toThrow(
      /DNS failure/,
    );
  });

  it("throws when there is no Lighthouse result at all", () => {
    expect(() => normalizePageSpeed({}, { url: "https://trumoveinc.com", strategy: "mobile" })).toThrow(
      PageSpeedError,
    );
  });
});

describe("assertOwnedTarget", () => {
  it("accepts an owned host regardless of www", () => {
    expect(assertOwnedTarget("https://www.trumoveinc.com/services", ["trumoveinc.com"])).toContain(
      "trumoveinc.com/services",
    );
  });

  it("refuses a host that is not an owned asset", () => {
    expect(() => assertOwnedTarget("https://competitor.com", ["trumoveinc.com"])).toThrow(/not an owned site/);
  });

  it("refuses non http protocols and malformed URLs", () => {
    expect(() => assertOwnedTarget("ftp://trumoveinc.com", ["trumoveinc.com"])).toThrow(/http and https/);
    expect(() => assertOwnedTarget("not a url", ["trumoveinc.com"])).toThrow(/not a valid URL/);
  });
});

describe("GA4 connection gate", () => {
  it("stays unconnected when only a browser measurement id exists", () => {
    const state = describeGa4Connection(
      readGa4EnvPresence({ VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY: "G-ABC123" }),
    );
    expect(state.connected).toBe(false);
    expect(state.credentialKind).toBeNull();
    expect(state.measurementIdPresent).toBe(true);
    expect(state.requirements.length).toBeGreaterThan(0);
    expect(state.statement).toMatch(/cannot read reporting data/);
  });

  it("stays unconnected with no credential at all", () => {
    const state = describeGa4Connection(readGa4EnvPresence({}));
    expect(state.connected).toBe(false);
    expect(state.requirements.some((line) => line.includes("GA4_SERVICE_ACCOUNT_JSON"))).toBe(true);
  });

  it("names the exact missing half of a partial OAuth credential", () => {
    const state = describeGa4Connection(
      readGa4EnvPresence({ GA4_OAUTH_CLIENT_ID: "id", GA4_OAUTH_REFRESH_TOKEN: "token" }),
    );
    expect(state.connected).toBe(false);
    expect(state.requirements).toEqual(["GA4_OAUTH_CLIENT_SECRET is not set on the server."]);
  });

  it("reports connected only when a full server credential is present", () => {
    expect(describeGa4Connection(readGa4EnvPresence({ GA4_SERVICE_ACCOUNT_JSON: "{}" })).connected).toBe(true);
  });
});

describe("ga4Window", () => {
  it("covers 28 complete days ending yesterday", () => {
    expect(ga4Window(new Date("2026-08-11T12:00:00Z"))).toEqual({
      startDate: "2026-07-14",
      endDate: "2026-08-10",
    });
  });
});

describe("missing snapshot copy", () => {
  it("does not claim nothing was run when failed attempts are stored", () => {
    const copy = describeMissingSnapshot([
      { status: "failed", error: "PageSpeed Insights returned HTTP 429", startedAt: "2026-08-11T20:00:00Z" },
      { status: "failed", error: "PageSpeed Insights returned HTTP 429", startedAt: "2026-08-11T19:00:00Z" },
    ]);
    expect(copy.title).toBe("No successful PageSpeed snapshot yet");
    expect(copy.description).toContain("2 run attempt(s)");
    expect(copy.description).toContain("HTTP 429");
  });

  it("says nothing was attempted only when there are no stored runs", () => {
    expect(describeMissingSnapshot([]).title).toBe("No PageSpeed run attempted yet");
  });
});
