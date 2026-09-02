import { describe, expect, it } from "vitest";

import {
  buildGoogleAdsCampaignQuery,
  describeGoogleAdsConnection,
  normalizeCustomerId,
  normalizeGoogleAdsReport,
  readGoogleAdsEnvPresence,
} from "./google-ads";

describe("readGoogleAdsEnvPresence", () => {
  it("reads presence only, never the value", () => {
    const presence = readGoogleAdsEnvPresence({
      GOOGLE_ADS_DEVELOPER_TOKEN: "secret",
      GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
      GOOGLE_ADS_ACCESS_TOKEN: "",
      GOOGLE_ADS_OAUTH_CLIENT_ID: "client",
      GOOGLE_ADS_OAUTH_CLIENT_SECRET: undefined,
      GOOGLE_ADS_OAUTH_REFRESH_TOKEN: "  ",
    });
    expect(presence).toEqual({
      developerToken: true,
      customerId: true,
      accessToken: false,
      oauthClientId: true,
      oauthClientSecret: false,
      oauthRefreshToken: false,
    });
  });
});

describe("normalizeCustomerId", () => {
  it("strips dashes and other non-digit characters", () => {
    expect(normalizeCustomerId("123-456-7890")).toBe("1234567890");
    expect(normalizeCustomerId("1234567890")).toBe("1234567890");
  });
});

describe("describeGoogleAdsConnection", () => {
  it("names every missing requirement when nothing is configured", () => {
    const state = describeGoogleAdsConnection({
      developerToken: false,
      customerId: false,
      accessToken: false,
      oauthClientId: false,
      oauthClientSecret: false,
      oauthRefreshToken: false,
    });
    expect(state.configured).toBe(false);
    expect(state.requirements).toContain("GOOGLE_ADS_DEVELOPER_TOKEN is not set.");
    expect(state.requirements).toContain("GOOGLE_ADS_CUSTOMER_ID is not set.");
    expect(state.requirements.join(" ")).toContain("GOOGLE_ADS_ACCESS_TOKEN");
  });

  it("names only the missing OAuth leg when the trio is partially set", () => {
    const state = describeGoogleAdsConnection({
      developerToken: true,
      customerId: true,
      accessToken: false,
      oauthClientId: true,
      oauthClientSecret: true,
      oauthRefreshToken: false,
    });
    expect(state.configured).toBe(false);
    expect(state.requirements).toEqual(["GOOGLE_ADS_OAUTH_REFRESH_TOKEN is not set."]);
  });

  it("is configured with a direct access token alone", () => {
    const state = describeGoogleAdsConnection({
      developerToken: true,
      customerId: true,
      accessToken: true,
      oauthClientId: false,
      oauthClientSecret: false,
      oauthRefreshToken: false,
    });
    expect(state.configured).toBe(true);
    expect(state.credentialKind).toBe("access_token");
    expect(state.connected).toBe(false);
  });

  it("reports connected only once a report has actually succeeded", () => {
    const presence = {
      developerToken: true,
      customerId: true,
      accessToken: true,
      oauthClientId: false,
      oauthClientSecret: false,
      oauthRefreshToken: false,
    };
    const unproven = describeGoogleAdsConnection(presence);
    expect(unproven.authenticated).toBe(false);
    expect(unproven.connected).toBe(false);

    const proven = describeGoogleAdsConnection(presence, true, true);
    expect(proven.authenticated).toBe(true);
    expect(proven.connected).toBe(true);
  });
});

describe("buildGoogleAdsCampaignQuery", () => {
  it("requests campaign metrics segmented by day over the trailing window", () => {
    const query = buildGoogleAdsCampaignQuery();
    expect(query).toContain("FROM campaign");
    expect(query).toContain("segments.date");
    expect(query).toContain("metrics.cost_micros");
    expect(query).toContain("campaign_budget.amount_micros");
    expect(query).toContain("DURING LAST_30_DAYS");
  });
});

describe("normalizeGoogleAdsReport", () => {
  it("parses campaign-day rows and totals them", () => {
    const report = normalizeGoogleAdsReport({
      results: [
        {
          campaign: {
            id: "111",
            name: "Search - Brand",
            status: "ENABLED",
            advertisingChannelType: "SEARCH",
          },
          campaignBudget: { amountMicros: "5000000" },
          segments: { date: "2026-08-30" },
          metrics: {
            impressions: "1000",
            clicks: "50",
            costMicros: "20000000",
            conversions: "5",
            conversionsValue: "500",
          },
        },
        {
          campaign: {
            id: "111",
            name: "Search - Brand",
            status: "ENABLED",
            advertisingChannelType: "SEARCH",
          },
          segments: { date: "2026-08-29" },
          metrics: {
            impressions: "900",
            clicks: "40",
            costMicros: "15000000",
            conversions: "3",
            conversionsValue: "300",
          },
        },
        {
          campaign: { id: "222", name: "Display - Prospecting", status: "PAUSED" },
          segments: { date: "2026-08-30" },
          metrics: { impressions: "500", clicks: "5", costMicros: "3000000" },
        },
      ],
    });

    expect(report.rowCount).toBe(3);
    expect(report.campaignCount).toBe(2);
    expect(report.totalImpressions).toBe(2400);
    expect(report.totalClicks).toBe(95);
    expect(report.totalCostMicros).toBe(38_000_000);
    expect(report.totalConversions).toBe(8);
    expect(report.rows[2]?.advertisingChannelType).toBeNull();
    expect(report.rows[2]?.conversions).toBe(0);
    // The budget is the campaign's own ceiling; absent is null, never 0 (PAID-1).
    expect(report.rows[0]?.budgetMicros).toBe(5_000_000);
    expect(report.rows[2]?.budgetMicros).toBeNull();
  });

  it("skips a malformed row rather than throwing", () => {
    const report = normalizeGoogleAdsReport({
      results: [
        { campaign: {}, segments: { date: "2026-08-30" }, metrics: {} },
        "not an object",
        null,
      ],
    });
    expect(report.rowCount).toBe(0);
    expect(report.rows).toEqual([]);
  });

  it("returns an empty report for an unreadable payload", () => {
    expect(normalizeGoogleAdsReport(null).rowCount).toBe(0);
    expect(normalizeGoogleAdsReport({}).rowCount).toBe(0);
    expect(normalizeGoogleAdsReport({ results: "not an array" }).rowCount).toBe(0);
  });
});
