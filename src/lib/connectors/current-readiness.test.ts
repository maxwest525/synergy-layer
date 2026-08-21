import { describe, expect, it } from "vitest";

import { projectCurrentConnectorReadiness } from "./current-readiness";

const configuredEnv = {
  N8N_WEBHOOK_SECRET: "webhook-secret",
  N8N_BASE_URL: "https://n8n.example.com",
  N8N_SEO_WORKFLOW_WEBHOOK_URL: "https://n8n.example.com/webhook/aoos-governed-seo",
};

function n8nRow(config: unknown, health = "healthy") {
  return {
    capability_key: "n8n",
    config,
    health,
    integration_state: "real",
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

  it("reads a configured connector with no stored row as never checked", () => {
    const n8n = projectCurrentConnectorReadiness([], configuredEnv).find(
      (item) => item.key === "n8n",
    )!;

    expect(n8n).toMatchObject({ state: "configured", health: "never_checked", persisted: null });
  });

  it("leaves an unconfigured connector unknown rather than never checked", () => {
    const n8n = projectCurrentConnectorReadiness([n8nRow({ probe_outcome: "success" })], {}).find(
      (item) => item.key === "n8n",
    )!;

    expect(n8n).toMatchObject({ state: "missing", health: "unknown", probeOutcome: null });
  });
});
