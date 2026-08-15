import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createRequestClient, resolveTenantId } = vi.hoisted(() => ({
  createRequestClient: vi.fn(),
  resolveTenantId: vi.fn(),
}));

vi.mock("../tenant.server", () => ({ createRequestClient, resolveTenantId }));

import { fetchConnectorReadiness, toConnectionRow } from "./connections.server";

function persistedHealthyConnection(capabilityKey: string) {
  return {
    capability_key: capabilityKey,
    config: { probe_outcome: "success" },
    created_at: "2026-08-14T15:00:00.000Z",
    health: "healthy" as const,
    id: "connection-id",
    integration_state: "real",
    last_checked_at: "2026-08-14T15:00:00.000Z",
    provider: "Self-hosted",
    secret_name: "N8N_WEBHOOK_SECRET",
    tenant_id: "tenant-id",
    updated_at: "2026-08-14T15:00:00.000Z",
  };
}

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

describe("fetchConnectorReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    resolveTenantId.mockResolvedValue("tenant-id");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not expose old healthy proof when current configuration is missing", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [persistedHealthyConnection("n8n")],
      error: null,
    });
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order }),
        }),
      }),
    };
    createRequestClient.mockReturnValue({ db, authenticated: true });

    const result = await fetchConnectorReadiness();
    const n8n = result.connections.find((connection) => connection.key === "n8n");

    expect(n8n).toMatchObject({ state: "missing", health: "unknown", persisted: null });
    expect(result.healthyCount).toBe(0);
  });

  it("uses persisted proof as health only while the connector remains configured", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", "configured-secret");
    const order = vi.fn().mockResolvedValue({
      data: [persistedHealthyConnection("n8n")],
      error: null,
    });
    const db = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order }),
        }),
      }),
    };
    createRequestClient.mockReturnValue({ db, authenticated: true });

    const result = await fetchConnectorReadiness();
    const n8n = result.connections.find((connection) => connection.key === "n8n");

    expect(n8n).toMatchObject({ state: "configured", health: "healthy" });
    expect(result.healthyCount).toBe(1);
  });
});
