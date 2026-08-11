import { rows, unwrap } from "./os.server";
import { createRequestClient, resolveTenantId } from "./tenant.server";

/**
 * Tool estate reads. Everything runs as the calling operator, so row level
 * security decides which client workspace is visible. Nothing in these tables
 * holds a credential value, a token, or a secret path.
 */
async function scope() {
  const { db, authenticated } = createRequestClient();
  const tenantId = authenticated ? await resolveTenantId(db) : null;
  return { db, tenantId, ready: authenticated && tenantId !== null };
}

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type ToolSystemRow = {
  id: string;
  stable_key: string;
  name: string;
  kind: string;
  provider: string | null;
  version: string | null;
  execution_location: string;
  discovered_from: string | null;
  installed_state: string;
  credential_state: string;
  verification_state: string;
  aoos_connection_state: string;
  last_verified_at: string | null;
  source_reference: string | null;
  summary: string | null;
  metadata: JsonValue;
};

export type ToolSystemSummary = ToolSystemRow & {
  operationCount: number;
  aliasCount: number;
};

export async function fetchToolEstate() {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { systems: [] as ToolSystemSummary[], operationCount: 0, aliasCount: 0 };

  const systems = rows(
    await db
      .from("tool_systems")
      .select("*")
      .eq("tenant_id", tenantId!)
      .order("kind")
      .order("name"),
  ) as unknown as ToolSystemRow[];

  const operations = rows(
    await db.from("tool_operations").select("system_id").eq("tenant_id", tenantId!),
  ) as { system_id: string }[];
  const aliases = rows(
    await db.from("tool_aliases").select("system_id").eq("tenant_id", tenantId!),
  ) as { system_id: string }[];

  const opCounts = new Map<string, number>();
  for (const row of operations) opCounts.set(row.system_id, (opCounts.get(row.system_id) ?? 0) + 1);
  const aliasCounts = new Map<string, number>();
  for (const row of aliases)
    aliasCounts.set(row.system_id, (aliasCounts.get(row.system_id) ?? 0) + 1);

  return {
    systems: systems.map((system) => ({
      ...system,
      operationCount: opCounts.get(system.id) ?? 0,
      aliasCount: aliasCounts.get(system.id) ?? 0,
    })),
    operationCount: operations.length,
    aliasCount: aliases.length,
  };
}

export async function fetchToolSystem(stableKey: string) {
  const { db, tenantId, ready } = await scope();
  if (!ready) return { system: null, operations: [], aliases: [] };

  const system = unwrap(
    await db
      .from("tool_systems")
      .select("*")
      .eq("tenant_id", tenantId!)
      .eq("stable_key", stableKey)
      .maybeSingle(),
  ) as unknown as ToolSystemRow | null;
  if (!system) return { system: null, operations: [], aliases: [] };

  const operations = rows(
    await db
      .from("tool_operations")
      .select("*")
      .eq("tenant_id", tenantId!)
      .eq("system_id", system.id)
      .order("operation_mode")
      .order("operation_key"),
  );
  const aliases = rows(
    await db
      .from("tool_aliases")
      .select("*")
      .eq("tenant_id", tenantId!)
      .eq("system_id", system.id)
      .order("alias_label"),
  );

  return { system, operations, aliases };
}
