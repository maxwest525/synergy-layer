import { describe, expect, it, vi } from "vitest";

import { costFromMicros, fetchCampaignPerformance } from "./reporting.server";

const ENV = {
  GOOGLE_ADS_DEVELOPER_TOKEN: "dev-token",
  GOOGLE_ADS_CUSTOMER_ID: "797-681-4060",
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: "811-090-4860",
  GOOGLE_ADS_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_ADS_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_ADS_OAUTH_REFRESH_TOKEN: "refresh-token",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SEARCH_BODY = {
  results: [
    {
      segments: { date: "2026-08-30" },
      campaign: {
        id: "123",
        name: "Long distance — FL",
        status: "ENABLED",
        advertisingChannelType: "SEARCH",
      },
      metrics: {
        impressions: "4821",
        clicks: "301",
        costMicros: "742110000",
        conversions: 12.5,
        conversionsValue: 8400.25,
      },
    },
  ],
};

function stub(searchResponse: Response = json(SEARCH_BODY)) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href.includes("oauth2.googleapis.com")) return json({ access_token: "access-token" });
    return searchResponse;
  });
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

describe("fetchCampaignPerformance", () => {
  it("sends login-customer-id, the developer token, and digits-only ids", async () => {
    const { fetcher, calls } = stub();
    await fetchCampaignPerformance({ env: ENV, fetcher, days: 30 });

    const search = calls.find((call) => call.url.includes("googleAds:search"))!;
    // Dashes are how Google displays an account id and are not what the API takes.
    expect(search.url).toContain("/customers/7976814060/googleAds:search");
    const headers = search.init!.headers as Record<string, string>;
    expect(headers["login-customer-id"]).toBe("8110904860");
    expect(headers["developer-token"]).toBe("dev-token");
    expect(headers["Authorization"]).toBe("Bearer access-token");
  });

  // Regression: the first version sent `pageSize: 10000`, which v25 refuses with
  // PAGE_SIZE_NOT_SUPPORTED. Every mocked test passed; only calling the real API
  // found it.
  it("sends no pageSize, which the v25 search endpoint rejects", async () => {
    const { fetcher, calls } = stub();
    await fetchCampaignPerformance({ env: ENV, fetcher });

    const search = calls.find((call) => call.url.includes("googleAds:search"))!;
    const body = JSON.parse(search.init!.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty("query");
    expect(body).not.toHaveProperty("pageSize");
  });

  it("falls back to the account's own id when no manager is configured", async () => {
    const { fetcher, calls } = stub();
    const { GOOGLE_ADS_LOGIN_CUSTOMER_ID: _omitted, ...standalone } = ENV;
    await fetchCampaignPerformance({ env: standalone, fetcher });

    const search = calls.find((call) => call.url.includes("googleAds:search"))!;
    expect((search.init!.headers as Record<string, string>)["login-customer-id"]).toBe(
      "7976814060",
    );
  });

  it("maps a row without converting micros on the way in", async () => {
    const { fetcher } = stub();
    const rows = await fetchCampaignPerformance({ env: ENV, fetcher });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      customerId: "7976814060",
      segmentDate: "2026-08-30",
      campaignId: "123",
      campaignName: "Long distance — FL",
      campaignStatus: "ENABLED",
      advertisingChannelType: "SEARCH",
      impressions: 4821,
      clicks: 301,
      // Stored exactly as Google said it. 742110000 micros, not 742.11.
      costMicros: 742110000,
      conversions: 12.5,
      conversionsValue: 8400.25,
    });
    expect(costFromMicros(rows[0]!.costMicros)).toBeCloseTo(742.11, 2);
  });

  it("treats a missing metric as zero rather than NaN", async () => {
    const { fetcher } = stub(
      json({
        results: [
          { segments: { date: "2026-08-30" }, campaign: { id: 9, name: "x", status: "PAUSED" } },
        ],
      }),
    );
    const rows = await fetchCampaignPerformance({ env: ENV, fetcher });
    expect(rows[0]).toMatchObject({ impressions: 0, clicks: 0, costMicros: 0, conversions: 0 });
    expect(Number.isNaN(rows[0]!.clicks)).toBe(false);
  });

  it("points at the manager header on a 403, because that is usually the cause", async () => {
    const { fetcher } = stub(json({ error: "denied" }, 403));
    await expect(fetchCampaignPerformance({ env: ENV, fetcher })).rejects.toThrow(
      /GOOGLE_ADS_LOGIN_CUSTOMER_ID/,
    );
  });

  it("names the missing credentials rather than failing vaguely", async () => {
    const { fetcher } = stub();
    await expect(fetchCampaignPerformance({ env: {}, fetcher })).rejects.toThrow(
      /GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID/,
    );
  });

  it("says the refresh token was refused, not that the report failed", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("oauth2") ? json({ error: "invalid_grant" }, 400) : json(SEARCH_BODY),
    ) as unknown as typeof fetch;
    await expect(fetchCampaignPerformance({ env: ENV, fetcher })).rejects.toThrow(
      /refused the Ads refresh token/,
    );
  });
});
