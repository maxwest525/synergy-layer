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

export type CurrentConnectorReadiness<Row extends PersistedConnectorReadiness> = Omit<
  ConnectorReadiness,
  "health"
> & {
  health: string;
  probeOutcome: ConnectorProbeOutcome | null;
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
      persisted: persistedConnection,
    };
  });
}
