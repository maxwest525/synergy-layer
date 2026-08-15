import { describe, expect, it } from "vitest";

import { toConnectionRow } from "./connections.server";

describe("connection persistence mapping", () => {
  it("stores only secret names and redacted probe proof", () => {
    const row = toConnectionRow(
      "tenant-id",
      {
        key: "n8n",
        label: "n8n",
        provider: "Self-hosted",
        state: "configured",
        health: "unknown",
        secretNames: ["N8N_API_KEY"],
        missing: [],
        safeConfig: { baseUrl: "https://n8n.example.com" },
      },
      {
        key: "n8n",
        health: "healthy",
        outcome: "success",
        checkedAt: "2026-08-14T15:00:00.000Z",
        missing: [],
        proof: { endpoint: "https://n8n.example.com/healthz", statusCode: 200 },
      },
    );

    expect(row).toMatchObject({
      tenant_id: "tenant-id",
      capability_key: "n8n",
      provider: "Self-hosted",
      integration_state: "real",
      secret_name: "N8N_API_KEY",
      health: "healthy",
      last_checked_at: "2026-08-14T15:00:00.000Z",
    });
    expect(row.config).toEqual({
      safe_config: { baseUrl: "https://n8n.example.com" },
      secret_names: ["N8N_API_KEY"],
      missing: [],
      probe_outcome: "success",
      proof: { endpoint: "https://n8n.example.com/healthz", statusCode: 200 },
    });
  });
});

