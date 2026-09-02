import { describe, expect, it } from "vitest";

import { projectCurrentConnectorReadiness } from "./current-readiness";

const configuredEnv = {
  N8N_WEBHOOK_SECRET: "webhook-secret",
  N8N_BASE_URL: "https://n8n.example.com",
  N8N_SEO_WORKFLOW_WEBHOOK_URL: "https://n8n.example.com/webhook/aoos-governed-seo",
};

function n8nRow(config: unknown, health = "healthy", lastCheckedAt: string | null = null) {
  return {
    capability_key: "n8n",
    config,
    health,
    integration_state: "real",
    last_checked_at: lastCheckedAt,
  };
}

function projectN8n(row: ReturnType<typeof n8nRow>) {
  return projectCurrentConnectorReadiness([row], configuredEnv).find((item) => item.key === "n8n")!;
}

describe("projectCurrentConnectorReadiness", () => {
  it("reads a stored health with no probe outcome as never checked", () => {
    const n8n = projectN8n(n8nRow({ safe_config: { baseUrl: "https://n8n.example.com" } }));

    expect(n8n.health).toBe("never_checked");
    expect(n8n.probeOutcome).toBeNull();
  });

  it("rejects a probe outcome no probe can produce", () => {
    const n8n = projectN8n(n8nRow({ probe_outcome: "seeded" }, "failing"));

    expect(n8n.health).toBe("never_checked");
    expect(n8n.probeOutcome).toBeNull();
  });

  it("keeps the stored health when a probe outcome stands behind it", () => {
    const n8n = projectN8n(n8nRow({ probe_outcome: "http_error" }, "failing"));

    expect(n8n.health).toBe("failing");
    expect(n8n.probeOutcome).toBe("http_error");
  });

  it("carries the check time only when a probe outcome stands behind the health", () => {
    const checked = projectN8n(
      n8nRow({ probe_outcome: "success" }, "healthy", "2026-09-02T06:00:00.000Z"),
    );
    expect(checked.checkedAt).toBe("2026-09-02T06:00:00.000Z");

    // A date on a row no probe wrote is not a check time (MON-20).
    const unproven = projectN8n(n8nRow({}, "healthy", "2026-09-02T06:00:00.000Z"));
    expect(unproven.health).toBe("never_checked");
    expect(unproven.checkedAt).toBeNull();
  });

  it("reads a configured connector with no stored row as never checked", () => {
    const n8n = projectCurrentConnectorReadiness([], configuredEnv).find(
      (item) => item.key === "n8n",
    )!;

    expect(n8n).toMatchObject({ state: "configured", health: "never_checked", persisted: null });
  });

  it("surfaces the status code and endpoint the probe saw", () => {
    const n8n = projectN8n(
      n8nRow(
        {
          probe_outcome: "http_error",
          proof: { statusCode: 401, endpoint: "https://n8n.example.com/healthz" },
        },
        "failing",
      ),
    );

    expect(n8n.probeProof).toEqual({
      statusCode: 401,
      endpoint: "https://n8n.example.com/healthz",
    });
  });

  it("withholds proof from a stored row no probe outcome stands behind", () => {
    const n8n = projectN8n(n8nRow({ proof: { statusCode: 200 } }, "healthy"));

    expect(n8n.probeOutcome).toBeNull();
    expect(n8n.probeProof).toBeNull();
  });

  it("reports no proof rather than an empty one when the probe recorded neither field", () => {
    const n8n = projectN8n(n8nRow({ probe_outcome: "configured_no_safe_probe", proof: {} }));

    expect(n8n.probeProof).toBeNull();
  });

  it("leaves an unconfigured connector unknown rather than never checked", () => {
    const n8n = projectCurrentConnectorReadiness([n8nRow({ probe_outcome: "success" })], {}).find(
      (item) => item.key === "n8n",
    )!;

    expect(n8n).toMatchObject({ state: "missing", health: "unknown", probeOutcome: null });
  });
});
