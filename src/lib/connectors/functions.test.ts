import { beforeEach, describe, expect, it, vi } from "vitest";

const assertOperator = vi.fn();
const requireTenantId = vi.fn();
const syncConnectorReadiness = vi.fn();

vi.mock("../os-admin.server", () => ({ assertOperator }));
vi.mock("../tenant.server", () => ({ requireTenantId }));
vi.mock("./connections.server", () => ({ syncConnectorReadiness }));

import { checkConnectorReadinessForOperator } from "./functions";

describe("connector readiness authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantId.mockResolvedValue("tenant-1");
    syncConnectorReadiness.mockResolvedValue([
      { capability_key: "supabase", health: "healthy" },
      { capability_key: "n8n", health: "degraded" },
    ]);
  });

  it("does not run connector probes when the signed-in user is not an operator", async () => {
    assertOperator.mockRejectedValue(new Error("operator required"));

    await expect(
      checkConnectorReadinessForOperator({ supabase: {} as never, userId: "viewer-1" }),
    ).rejects.toThrow("operator required");
    expect(requireTenantId).not.toHaveBeenCalled();
    expect(syncConnectorReadiness).not.toHaveBeenCalled();
  });

  it("returns the persisted connector totals after an operator check", async () => {
    assertOperator.mockResolvedValue(undefined);

    await expect(
      checkConnectorReadinessForOperator({ supabase: {} as never, userId: "operator-1" }),
    ).resolves.toEqual({ connections: expect.any(Array), checkedCount: 2, healthyCount: 1 });
  });
});
