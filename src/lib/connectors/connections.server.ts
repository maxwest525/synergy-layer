import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { createRequestClient, resolveTenantId } from "../tenant.server";
import { CONNECTOR_CATALOG, describeConnectorReadiness, type ConnectorReadiness } from "./catalog";
import { probeConnector, type ConnectorProbeResult } from "./probes.server";

type Client = SupabaseClient<Database>;
type ConnectionInsert = Database["public"]["Tables"]["tenant_connections"]["Insert"];

export function toConnectionRow(
  tenantId: string,
  readiness: ConnectorReadiness,
  probe: ConnectorProbeResult,
): ConnectionInsert {
  return {
    tenant_id: tenantId,
    capability_key: readiness.key,
    provider: readiness.provider,
    integration_state: readiness.state === "configured" ? "real" : "pending",
    secret_name: readiness.secretNames[0] ?? null,
    health: probe.health,
    last_checked_at: probe.checkedAt,
    config: {
      safe_config: readiness.safeConfig,
      secret_names: readiness.secretNames,
      missing: probe.missing,
      probe_outcome: probe.outcome,
      proof: probe.proof,
    },
  };
}

export async function syncConnectorReadiness(
  client: Client,
  tenantId: string,
  env: Record<string, string | undefined> = process.env,
) {
  const readiness = describeConnectorReadiness(env);
  const probes = await Promise.all(readiness.map((item) => probeConnector(item.key, { env })));
  const rows = readiness.map((item, index) => toConnectionRow(tenantId, item, probes[index]!));
  const { data, error } = await client
    .from("tenant_connections")
    .upsert(rows, { onConflict: "tenant_id,capability_key" })
    .select("*")
    .order("capability_key");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchConnectorReadiness() {
  const { db, authenticated } = createRequestClient();
  const tenantId = authenticated ? await resolveTenantId(db) : null;
  if (!tenantId) return { connections: [], configuredCount: 0, healthyCount: 0 };

  const readiness = describeConnectorReadiness(process.env);
  const { data, error } = await db
    .from("tenant_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("capability_key");
  if (error) throw new Error(error.message);
  const persisted = new Map((data ?? []).map((row) => [row.capability_key, row]));
  const connections = readiness.map((item) => {
    const persistedConnection = persisted.get(item.key) ?? null;
    const configured = item.state === "configured";
    return {
      ...item,
      health: configured ? (persistedConnection?.health ?? "unknown") : "unknown",
      persisted: configured ? persistedConnection : null,
    };
  });
  return {
    connections,
    configuredCount: connections.filter((item) => item.state === "configured").length,
    healthyCount: connections.filter((item) => item.persisted?.health === "healthy").length,
  };
}

export async function checkAllConnectorReadiness() {
  const { db, authenticated } = createRequestClient();
  const tenantId = authenticated ? await resolveTenantId(db) : null;
  if (!tenantId) throw new Error("An authenticated tenant operator is required.");
  const connections = await syncConnectorReadiness(db, tenantId);
  return {
    connections,
    checkedCount: CONNECTOR_CATALOG.length,
    healthyCount: connections.filter((row) => row.health === "healthy").length,
  };
}
