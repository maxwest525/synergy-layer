import { SEO_REQUIRED_CONNECTORS, type ConnectorProof, type SeoPreflight } from "./types";

const acceptableHealth = new Set(["healthy", "degraded"]);

export function assessSeoPreflight(
  connections: ConnectorProof[],
  evidence: { searchConsoleRows: number; dataForSeoSnapshots: number },
): SeoPreflight {
  const byKey = new Map(connections.map((row) => [row.capabilityKey, row]));
  const missingConnectors: string[] = [];
  const unhealthyConnectors: string[] = [];

  for (const key of SEO_REQUIRED_CONNECTORS) {
    const row = byKey.get(key);
    if (!row || row.integrationState !== "real") {
      missingConnectors.push(key);
      continue;
    }
    const configuredWithoutProbe = row.probeOutcome === "configured_no_safe_probe";
    if (!acceptableHealth.has(row.health) && !configuredWithoutProbe) unhealthyConnectors.push(key);
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
