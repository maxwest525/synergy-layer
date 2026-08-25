import {
  CONNECTOR_PROBE_OUTCOMES,
  describeConnectorReadiness,
  type ConnectorProbeOutcome,
  type ConnectorReadiness,
} from "./catalog";

export type PersistedConnectorReadiness = {
  capability_key: string;
  config: unknown;
  health: string;
  integration_state: string;
};

// What the probe observed, kept next to the outcome it produced. Without this the
// ledger can say "http error" and nothing else, which cannot distinguish a rejected
// credential from an unreachable host - a distinction that cost a full session on
// 2026-08-24 because the number was recorded and never read.
export type StoredProbeProof = {
  statusCode?: number;
  endpoint?: string;
};

export type CurrentConnectorReadiness<Row extends PersistedConnectorReadiness> = Omit<
  ConnectorReadiness,
  "health"
> & {
  health: string;
  probeOutcome: ConnectorProbeOutcome | null;
  probeProof: StoredProbeProof | null;
  persisted: Row | null;
};

// syncConnectorReadiness is the only writer of these rows and it always records
// the outcome of the call it made next to the health it measured. A stored
// health with no such outcome behind it was never established by a probe, so it
// is not a health reading and must not be projected as one.
function storedProbeOutcome(config: unknown): ConnectorProbeOutcome | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const outcome = (config as Record<string, unknown>)["probe_outcome"];
  return CONNECTOR_PROBE_OUTCOMES.find((candidate) => candidate === outcome) ?? null;
}

// Read only alongside a stored outcome, for the same reason storedProbeOutcome
// exists: proof left over from an earlier call is not evidence about this one.
function storedProbeProof(config: unknown): StoredProbeProof | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const proof = (config as Record<string, unknown>)["proof"];
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return null;
  const record = proof as Record<string, unknown>;
  const statusCode = record["statusCode"];
  const endpoint = record["endpoint"];
  const projected: StoredProbeProof = {
    ...(typeof statusCode === "number" ? { statusCode } : {}),
    ...(typeof endpoint === "string" && endpoint ? { endpoint } : {}),
  };
  return projected.statusCode === undefined && projected.endpoint === undefined ? null : projected;
}

export function projectCurrentConnectorReadiness<Row extends PersistedConnectorReadiness>(
  rows: readonly Row[],
  env: Record<string, string | undefined>,
): CurrentConnectorReadiness<Row>[] {
  const persisted = new Map(rows.map((row) => [row.capability_key, row]));
  return describeConnectorReadiness(env).map((item) => {
    const configured = item.state === "configured";
    const persistedConnection = configured ? (persisted.get(item.key) ?? null) : null;
    const probeOutcome = persistedConnection
      ? storedProbeOutcome(persistedConnection.config)
      : null;
    const measured = probeOutcome && persistedConnection ? persistedConnection.health : null;
    return {
      ...item,
      health: configured ? (measured ?? "never_checked") : "unknown",
      probeOutcome,
      probeProof:
        probeOutcome && persistedConnection ? storedProbeProof(persistedConnection.config) : null,
      persisted: persistedConnection,
    };
  });
}
