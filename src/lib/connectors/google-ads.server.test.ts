import { describe, expect, it, vi } from "vitest";

import { probeGoogleAds } from "./google-ads.server";

const env = {
  GOOGLE_ADS_DEVELOPER_TOKEN: "developer-secret",
  GOOGLE_ADS_CUSTOMER_ID: "1234567890",
  GOOGLE_ADS_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_ADS_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_ADS_OAUTH_REFRESH_TOKEN: "refresh-secret",
};

describe("Google Ads bridge", () => {
  it("refreshes OAuth and performs only the accessible-customer read", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ access_token: "short-lived-secret" }))
      .mockResolvedValueOnce(Response.json({ resourceNames: ["customers/123", "customers/456"] }));

    const result = await probeGoogleAds({ env, fetcher });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",
    );
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("GET");
    expect(result.health).toBe("healthy");
    expect(result.proof.accessibleCustomerCount).toBe(2);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("returns redacted failure proof without upstream response content", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"error":"developer-secret was rejected"}', { status: 403 }),
      );

    const result = await probeGoogleAds({
      env: { ...env, GOOGLE_ADS_ACCESS_TOKEN: "access" },
      fetcher,
    });

    expect(result.outcome).toBe("http_error");
    expect(result.proof.statusCode).toBe(403);
    expect(JSON.stringify(result)).not.toContain("developer-secret");
  });

  it("refuses a successful response with an unreadable customer schema", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ resourceNames: "developer-secret" }));

    const result = await probeGoogleAds({
      env: { ...env, GOOGLE_ADS_ACCESS_TOKEN: "access" },
      fetcher,
    });

    expect(result.outcome).toBe("schema_error");
    expect(JSON.stringify(result)).not.toContain("developer-secret");
  });
});
