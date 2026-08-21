import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONNECTION_OUTPUTS, type ConnectionFacts } from "./connections";

/**
 * One tenant-scoped read of how far each connection's evidence travels.
 *
 * Three questions per connection, and the third is the one nothing has asked
 * before: are its credentials present, has it stored anything, and has any of
 * that become a finding the operator sees.
 *
 * Counted with `head: true` so the database returns the total rather than a
 * page of rows. An earlier page in this project reported a truncated read as a
 * total; counting server-side removes the possibility.
 *
 * No provider is called. Every number is a count of stored rows, so this read
 * is free and safe on every visit.
 */
export const getConnectionFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly ConnectionFacts[]> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead } = await import("./essentials");
    const { describeConnectorReadiness } = await import("./connectors/catalog");

    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    const configured = new Set(
      describeConnectorReadiness(process.env)
        .filter((connector) => connector.state === "configured")
        .map((connector) => connector.key as string),
    );

    // One count per distinct table, so two connections sharing a store are not
    // charged two reads for the same number.
    const tables = [
      ...new Set(
        CONNECTION_OUTPUTS.map((output) => output.table).filter(
          (table): table is string => table !== null,
        ),
      ),
    ];

    const [rowCounts, findingResult] = await Promise.all([
      Promise.all(
        tables.map(async (table) => {
          const result = await db
            .from(table as "search_console_snapshots")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId);
          return [table, assertRead(`${table} rows`, result).count ?? 0] as const;
        }),
      ),
      db.from("recommendations").select("source_module").eq("tenant_id", tenantId).limit(2000),
    ]);

    const storedByTable = new Map(rowCounts);

    const findingsBySource = new Map<string, number>();
    for (const row of assertRead("Recommendations", findingResult).data ?? []) {
      const source = row.source_module;
      if (typeof source !== "string") continue;
      findingsBySource.set(source, (findingsBySource.get(source) ?? 0) + 1);
    }

    return CONNECTION_OUTPUTS.map((output) => ({
      key: output.key,
      configured: configured.has(output.key),
      // Null, not zero, when the connection has no store at all: that is a
      // different fact from a store that is empty.
      storedRows: output.table === null ? null : (storedByTable.get(output.table) ?? 0),
      findings:
        output.findingSource === null ? null : (findingsBySource.get(output.findingSource) ?? 0),
    }));
  });
