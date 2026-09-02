import { projectCurrentConnectorReadiness } from "../connectors/current-readiness";
import { SEO_REQUIRED_CONNECTORS, type ConnectorProof, type SeoPreflight } from "./types";

const acceptableHealth = new Set(["healthy", "degraded"]);

/**
 * A required connector that another connection can stand in for. The
 * preflight asked for cloud Firecrawl by name while the self-hosted
 * renderer, which every page proof and competitor observation already
 * uses, sat real and healthy beside it; six runs blocked on that alone
 * (CODE-44).
 */
export const CONNECTOR_STAND_INS: Readonly<Record<string, readonly string[]>> = {
  firecrawl: ["selfhosted_firecrawl"],
};

function usable(row: ConnectorProof | undefined): "missing" | "unhealthy" | "ok" {
  if (!row || row.integrationState !== "real") return "missing";
  const configuredWithoutProbe = row.probeOutcome === "configured_no_safe_probe";
  if (!acceptableHealth.has(row.health) && !configuredWithoutProbe) return "unhealthy";
  return "ok";
}

type PersistedSeoConnector = {
  capability_key: string;
  config: unknown;
  health: string;
  integration_state: string;
};

export function buildCurrentSeoConnectorSnapshot(
  persistedConnections: readonly PersistedSeoConnector[],
  env: Record<string, string | undefined>,
): ConnectorProof[] {
  return projectCurrentConnectorReadiness(persistedConnections, env).map((item) => ({
    capabilityKey: item.key,
    integrationState: item.persisted?.integration_state ?? "pending",
    health: item.health,
    probeOutcome: item.probeOutcome,
  }));
}

export function assessSeoPreflight(
  connections: ConnectorProof[],
  evidence: { searchConsoleRows: number; dataForSeoSnapshots: number },
): SeoPreflight {
  const byKey = new Map(connections.map((row) => [row.capabilityKey, row]));
  const missingConnectors: string[] = [];
  const unhealthyConnectors: string[] = [];

  for (const key of SEO_REQUIRED_CONNECTORS) {
    const candidates = [key, ...(CONNECTOR_STAND_INS[key] ?? [])];
    const states = candidates.map((candidate) => usable(byKey.get(candidate)));
    if (states.includes("ok")) continue;
    // Nothing usable: report the primary as missing when no candidate is
    // real, otherwise as unhealthy (something real answered badly).
    if (states.includes("unhealthy")) unhealthyConnectors.push(key);
    else missingConnectors.push(key);
  }

  const missingEvidence = [
    ...(evidence.searchConsoleRows > 0 ? [] : ["google_search_console"]),
    ...(evidence.dataForSeoSnapshots > 0 ? [] : ["dataforseo"]),
  ];
  return {
    ready:
      missingConnectors.length === 0 &&
      unhealthyConnectors.length === 0 &&
      missingEvidence.length === 0,
    missingConnectors,
    unhealthyConnectors,
    missingEvidence,
  };
}
