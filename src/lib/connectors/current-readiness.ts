import { describeConnectorReadiness, type ConnectorReadiness } from "./catalog";

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
  persisted: Row | null;
};

export function projectCurrentConnectorReadiness<Row extends PersistedConnectorReadiness>(
  rows: readonly Row[],
  env: Record<string, string | undefined>,
): CurrentConnectorReadiness<Row>[] {
  const persisted = new Map(rows.map((row) => [row.capability_key, row]));
  return describeConnectorReadiness(env).map((item) => {
    const persistedConnection = persisted.get(item.key) ?? null;
    const configured = item.state === "configured";
    return {
      ...item,
      health: configured ? (persistedConnection?.health ?? "unknown") : "unknown",
      persisted: configured ? persistedConnection : null,
    };
  });
}
