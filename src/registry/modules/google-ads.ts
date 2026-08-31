import type { ModuleDefinition } from "../types";

/**
 * Google Ads, read directly rather than through AdLoop.
 *
 * This module exists because the connector did not. Google Ads sat in the
 * catalog with a credential probe and nothing behind it — `connections.ts`
 * carried `table: null` and `findingSources: []`, and the systems screen said
 * "nothing in this system calls it". The row could read healthy while the paid
 * side of the business produced no evidence at all.
 *
 * Everything below was exercised against the live account on 2026-08-31.
 */
export const definition: ModuleDefinition = {
  module: "google-ads",
  capabilities: [
    {
      key: "cap.google_ads",
      name: "Google Ads API",
      kind: "connector",
      category: "Paid media",
      description:
        "Campaign performance read from the Google Ads API v25, segmented by day. OAuth refresh token exchanged per call; cost is kept in micros exactly as the provider returns it.",
      integrationState: "real",
      authKind: "oauth_refresh_token",
      operations: [
        {
          name: "listAccessibleCustomers",
          description:
            "Every account the OAuth user can reach. Used as the connector health probe because it needs no customer id and no manager header.",
          endpoint: "GET /v25/customers:listAccessibleCustomers",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
          gotcha:
            "Passes without login-customer-id, which is exactly why a green probe does not prove that reporting works.",
        },
        {
          name: "search (campaign performance)",
          description:
            "GAQL over `campaign` for date, id, name, status, channel type, impressions, clicks, cost_micros, conversions and conversions_value.",
          endpoint: "POST /v25/customers/{customerId}/googleAds:search",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
          gotcha:
            "Two things bite. (1) `pageSize` is REJECTED — PAGE_SIZE_NOT_SUPPORTED, HTTP 400. Send only `query`. (2) A client account under a manager needs the `login-customer-id` header or the call 403s in a way that reads like a bad credential.",
        },
        {
          name: "oauth token exchange",
          description: "Refresh token to short-lived access token, per call.",
          endpoint: "POST https://oauth2.googleapis.com/token",
          mutates: false,
          verified: "called",
          verifiedOn: "2026-08-31",
        },
      ],
      config: {
        mutating: false,
        apiVersion: "v25",
        credentials:
          "GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_OAUTH_CLIENT_ID, GOOGLE_ADS_OAUTH_CLIENT_SECRET, GOOGLE_ADS_OAUTH_REFRESH_TOKEN",
        optional:
          "GOOGLE_ADS_LOGIN_CUSTOMER_ID — required for a client account under a manager, absent for a standalone account, so the client falls back to the account's own id.",
        accessLevel:
          "Basic — 15,000 operations per day across test and production, on a sliding 24 hour window. A quota, not a charge.",
        implementation: "src/lib/google-ads/reporting.server.ts",
        storage:
          "None yet. The read returns rows and nothing persists them; a table for campaign-day evidence has not been created.",
      },
    },
  ],
};
