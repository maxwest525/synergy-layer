import { describe, expect, it } from "vitest";

import {
  assertOwnedTarget,
  describeMissingSnapshot,
  normalizePageSpeed,
  PageSpeedError,
  runStatusFor,
} from "./measurement/pagespeed";
import {
  describeGa4Connection,
  ga4PropertyForSearchConsoleProperty,
  ga4Window,
  readGa4EnvPresence,
} from "./measurement/ga4";
import {
  buildGa4InventoryRequest,
  ga4ResponseProvesAuthentication,
  normalizeGa4Inventory,
} from "./measurement/ga4.server";

const TRUMOVE_GA4_PROPERTY = "properties/536830122";

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
          details: {
            type: "opportunity",
            overallSavingsMs: 900,
            overallSavingsBytes: 122880,
          },
        },
        "render-blocking-resources": {
          title: "Eliminate render blocking resources",
          description: "Defer non critical CSS.",
          details: { type: "opportunity", overallSavingsMs: 240 },
        },
        "noop-opportunity": {
          title: "Nothing to gain",
          details: {
            type: "opportunity",
            overallSavingsMs: 0,
            overallSavingsBytes: 0,
          },
        },
        "not-an-opportunity": {
          title: "Diagnostic",
          details: { type: "table" },
        },
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
    const result = normalizePageSpeed(payload, {
      url: "https://trumoveinc.com",
      strategy: "desktop",
    });

    expect(result.seoScore).toBeNull();
    expect(result.clsValue).toBeNull();
    expect(result.missing).toContain("SEO score");
    expect(result.missing).toContain("CLS");
    expect(runStatusFor(result)).toBe("partial");
  });

  it("throws on a provider error payload instead of storing a success", () => {
    expect(() =>
      normalizePageSpeed(
        { error: { code: 429, message: "Quota exceeded" } },
        {
          url: "https://trumoveinc.com",
          strategy: "mobile",
        },
      ),
    ).toThrow(/Quota exceeded/);
  });

  it("throws on a Lighthouse runtime error", () => {
    const payload = lighthousePayload({
      runtimeError: {
        code: "ERRORED_DOCUMENT_REQUEST",
        message: "DNS failure",
      },
    });
    expect(() =>
      normalizePageSpeed(payload, {
        url: "https://trumoveinc.com",
        strategy: "mobile",
      }),
    ).toThrow(/DNS failure/);
  });

  it("throws when there is no Lighthouse result at all", () => {
    expect(() =>
      normalizePageSpeed(
        {},
        { url: "https://trumoveinc.com", strategy: "mobile" },
      ),
    ).toThrow(PageSpeedError);
  });
});

describe("assertOwnedTarget", () => {
  it("accepts an owned host regardless of www", () => {
    expect(
      assertOwnedTarget("https://www.trumoveinc.com/services", [
        "trumoveinc.com",
      ]),
    ).toContain("trumoveinc.com/services");
  });

  it("refuses a host that is not an owned asset", () => {
    expect(() =>
      assertOwnedTarget("https://competitor.com", ["trumoveinc.com"]),
    ).toThrow(/not an owned site/);
  });

  it("refuses non http protocols and malformed URLs", () => {
    expect(() =>
      assertOwnedTarget("ftp://trumoveinc.com", ["trumoveinc.com"]),
    ).toThrow(/http and https/);
    expect(() => assertOwnedTarget("not a url", ["trumoveinc.com"])).toThrow(
      /not a valid URL/,
    );
  });
});

describe("GA4 connection gate", () => {
  it("binds GA4 only from a supported tenant Search Console property", () => {
    expect(
      ga4PropertyForSearchConsoleProperty("sc-domain:trumoveinc.com"),
    ).toBe(TRUMOVE_GA4_PROPERTY);
    expect(
      ga4PropertyForSearchConsoleProperty("https://trumoveinc.com/"),
    ).toBe(TRUMOVE_GA4_PROPERTY);
    expect(
      ga4PropertyForSearchConsoleProperty("sc-domain:competitor.com"),
    ).toBeNull();
    expect(ga4PropertyForSearchConsoleProperty(null)).toBeNull();
  });

  it("fails closed when the tenant has no supported GA4 binding", () => {
    const state = describeGa4Connection(
      readGa4EnvPresence({ GA4_SERVICE_ACCOUNT_JSON: "{}" }),
      null,
    );
    expect(state.configured).toBe(false);
    expect(state.connected).toBe(false);
    expect(state.statement).toMatch(/No GA4 property is bound/);
  });

  it("stays unconnected when only a browser measurement id exists", () => {
    const state = describeGa4Connection(
      readGa4EnvPresence({
        VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY: "G-ABC123",
      }),
      TRUMOVE_GA4_PROPERTY,
    );
    expect(state.connected).toBe(false);
    expect(state.credentialKind).toBeNull();
    expect(state.measurementIdPresent).toBe(true);
    expect(state.requirements.length).toBeGreaterThan(0);
    expect(state.statement).toMatch(/cannot authorize reporting reads/);
  });

  it("stays unconnected with no credential at all", () => {
    const state = describeGa4Connection(
      readGa4EnvPresence({}),
      TRUMOVE_GA4_PROPERTY,
    );
    expect(state.connected).toBe(false);
    expect(
      state.requirements.some((line) =>
        line.includes("GA4_SERVICE_ACCOUNT_JSON"),
      ),
    ).toBe(true);
  });

  it("names the exact missing half of a partial OAuth credential", () => {
    const state = describeGa4Connection(
      readGa4EnvPresence({
        GA4_OAUTH_CLIENT_ID: "id",
        GA4_OAUTH_REFRESH_TOKEN: "token",
      }),
      TRUMOVE_GA4_PROPERTY,
    );
    expect(state.connected).toBe(false);
    expect(state.requirements).toEqual([
      "GA4_OAUTH_CLIENT_SECRET is not set on the server.",
    ]);
  });

  it("separates configured credentials from a proven successful connection", () => {
    const presence = readGa4EnvPresence({ GA4_SERVICE_ACCOUNT_JSON: "{}" });
    expect(
      describeGa4Connection(presence, TRUMOVE_GA4_PROPERTY).configured,
    ).toBe(true);
    expect(
      describeGa4Connection(presence, TRUMOVE_GA4_PROPERTY).authenticated,
    ).toBe(false);
    expect(
      describeGa4Connection(presence, TRUMOVE_GA4_PROPERTY).connected,
    ).toBe(false);
    expect(
      describeGa4Connection(presence, TRUMOVE_GA4_PROPERTY, false, true),
    ).toMatchObject({
      configured: true,
      authenticated: true,
      connected: false,
    });
    expect(
      describeGa4Connection(presence, TRUMOVE_GA4_PROPERTY, true).connected,
    ).toBe(true);
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

describe("GA4 exact-page event inventory", () => {
  it("separates rejected credentials from authenticated property-read failures", () => {
    expect(ga4ResponseProvesAuthentication(401)).toBe(false);
    expect(ga4ResponseProvesAuthentication(403)).toBe(true);
    expect(ga4ResponseProvesAuthentication(400)).toBe(true);
    expect(ga4ResponseProvesAuthentication(503)).toBe(false);
  });

  it("asks the official report for exact host, page, and event dimensions", () => {
    const body = buildGa4InventoryRequest({
      startDate: "2026-07-14",
      endDate: "2026-08-10",
    });
    expect(body.dimensions.map((dimension) => dimension.name)).toEqual([
      "hostName",
      "pagePathPlusQueryString",
      "eventName",
    ]);
    expect(body.metrics.map((metric) => metric.name)).toEqual([
      "eventCount",
      "activeUsers",
      "sessions",
    ]);
    expect(body.returnPropertyQuota).toBe(true);
  });

  it("filters a change window to one exact hostname and page path", () => {
    const body = buildGa4InventoryRequest(
      { startDate: "2026-08-01", endDate: "2026-08-07" },
      "https://trumoveinc.com/moving-services?zip=12345",
    );
    expect(body.dimensionFilter?.andGroup.expressions).toEqual([
      expect.objectContaining({
        filter: expect.objectContaining({
          fieldName: "hostName",
          stringFilter: expect.objectContaining({
            value: "trumoveinc.com",
            matchType: "EXACT",
          }),
        }),
      }),
      expect.objectContaining({
        filter: expect.objectContaining({
          fieldName: "pagePathPlusQueryString",
          stringFilter: expect.objectContaining({
            value: "/moving-services?zip=12345",
            matchType: "EXACT",
          }),
        }),
      }),
    ]);
  });

  it("normalizes provider strings without inventing events or users", () => {
    const report = normalizeGa4Inventory({
      rowCount: 2,
      rows: [
        {
          dimensionValues: [
            { value: "trumoveinc.com" },
            { value: "/moving-services?zip=12345" },
            { value: "generate_lead" },
          ],
          metricValues: [{ value: "4" }, { value: "3" }, { value: "2" }],
        },
        {
          dimensionValues: [
            { value: "trumoveinc.com" },
            { value: "/moving-services" },
            { value: "page_view" },
          ],
          metricValues: [{ value: "11" }, { value: "8" }, { value: "7" }],
        },
      ],
      totals: [
        { metricValues: [{ value: "15" }, { value: "9" }, { value: "9" }] },
      ],
      propertyQuota: { tokensPerDay: { consumed: 1, remaining: 999 } },
    });
    expect(report.rowCount).toBe(2);
    expect(report.pageCount).toBe(2);
    expect(report.eventNameCount).toBe(2);
    expect(report.totalEventCount).toBe(15);
    expect(report.totalSessions).toBe(9);
    expect(report.rows[0]).toMatchObject({
      hostName: "trumoveinc.com",
      pagePath: "/moving-services?zip=12345",
      eventName: "generate_lead",
      eventCount: 4,
      activeUsers: 3,
      sessions: 2,
    });
  });

  it("keeps a valid empty report empty", () => {
    expect(normalizeGa4Inventory({ rowCount: 0 })).toMatchObject({
      rowCount: 0,
      pageCount: 0,
      eventNameCount: 0,
      totalEventCount: 0,
      totalSessions: 0,
      rows: [],
    });
  });
});

describe("missing snapshot copy", () => {
  it("does not claim nothing was run when failed attempts are stored", () => {
    const copy = describeMissingSnapshot([
      {
        status: "failed",
        error: "PageSpeed Insights returned HTTP 429",
        startedAt: "2026-08-11T20:00:00Z",
      },
      {
        status: "failed",
        error: "PageSpeed Insights returned HTTP 429",
        startedAt: "2026-08-11T19:00:00Z",
      },
    ]);
    expect(copy.title).toBe("No successful PageSpeed snapshot yet");
    expect(copy.description).toContain("2 run attempt(s)");
    expect(copy.description).toContain("HTTP 429");
  });

  it("says nothing was attempted only when there are no stored runs", () => {
    expect(describeMissingSnapshot([]).title).toBe(
      "No PageSpeed run attempted yet",
    );
  });
});
