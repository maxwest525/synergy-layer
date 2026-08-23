import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONNECTION_OUTPUTS,
  FINDING_SOURCES,
  type ConnectionFacts,
  type ConnectionOutput,
  type SuccessFilter,
} from "./connections";

/**
 * One tenant-scoped read of how far each connection's evidence travels.
 *
 * Four questions per connection, and the last two are the ones nothing has
 * asked before: are its credentials present, has it stored a successful row,
 * how many attempts failed, and has any of it become a finding the operator
 * sees.
 *
 * Every number here is a `head: true` count, so the database returns the total
 * rather than a page of rows this process then has to count. That matters
 * twice over: an earlier page in this project reported a truncated read as a
 * total, and the first draft of this file counted findings by pulling 2000
 * recommendation rows - which, past 2000, would have reported a working
 * connector as reaching nobody.
 *
 * No provider is called. Every number is a count of stored rows, so this read
 * is free and safe on every visit.
 */
export const getConnectionFacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<readonly ConnectionFacts[]> => {
    const { requireTenantId } = await import("./tenant.server");
    const { assertRead, EssentialsReadError } = await import("./essentials");
    const { describeConnectorReadiness } = await import("./connectors/catalog");

    const tenantId = await requireTenantId(context.supabase);
    const db = context.supabase;

    /**
     * A count with no error but no number is a read that did not answer. It
     * must not become a zero: "nothing is stored" and "we could not tell" are
     * different sentences, and only one of them is an accusation.
     */
    function exactly<T extends { error: { message: string } | null; count: number | null }>(
      label: string,
      result: T,
    ): number {
      const checked = assertRead(label, result);
      if (typeof checked.count !== "number") {
        throw new EssentialsReadError(label, "the database returned no count");
      }
      return checked.count;
    }

    function scoped(table: string, scope?: ConnectionOutput["scope"]) {
      const query = db
        .from(table as "search_console_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if (!scope) return query;
      // Three renderers write to `page_metadata_observations`. Without this each
      // would be counted the others' rows, which is the misreport this scope
      // exists to prevent.
      const narrowedToOwner = query.like(scope.column, `${scope.prefix}%`);
      return scope.notPrefix === undefined
        ? narrowedToOwner
        : narrowedToOwner.not(scope.column, "like", `${scope.notPrefix}%`);
    }

    /** The same count, narrowed to the rows that record a success. */
    function narrowed(
      table: string,
      filter: SuccessFilter,
      matching: boolean,
      scope?: ConnectionOutput["scope"],
    ) {
      const query = scoped(table, scope);
      if (filter.kind === "is-null") {
        return matching ? query.is(filter.column, null) : query.not(filter.column, "is", null);
      }
      return matching
        ? query.eq(filter.column, filter.value)
        : query.neq(filter.column, filter.value);
    }

    const withTable = CONNECTION_OUTPUTS.filter(
      (output): output is (typeof CONNECTION_OUTPUTS)[number] & { table: string } =>
        output.table !== null,
    );

    const [tableCounts, findingCounts] = await Promise.all([
      Promise.all(
        withTable.map(
          async (output): Promise<readonly [string, { stored: number; failed: number | null }]> => {
            // A table with no failure marker stores only successes, so one count
            // answers both questions and the second read is not worth making.
            if (output.succeeded === null) {
              const total = exactly(
                `${output.table} rows`,
                await scoped(output.table, output.scope),
              );
              return [output.key, { stored: total, failed: null }] as const;
            }
            const [stored, failed] = await Promise.all([
              narrowed(output.table, output.succeeded, true, output.scope),
              narrowed(output.table, output.succeeded, false, output.scope),
            ]);
            return [
              output.key,
              {
                stored: exactly(`${output.table} successful rows`, stored),
                failed: exactly(`${output.table} failed attempts`, failed),
              },
            ] as const;
          },
        ),
      ),
      // One count per module that can write a recommendation. There are three,
      // so this is three cheap reads rather than one capped page of rows.
      //
      // Every state counts, rejected included: a suggestion the operator turned
      // down still reached them, and reaching them is the only question here.
      Promise.all(
        FINDING_SOURCES.map(async (source) => {
          const result = await db
            .from("recommendations")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("source_module", source);
          return [source, exactly(`${source} findings`, result)] as const;
        }),
      ),
    ]);

    const configured = new Set(
      describeConnectorReadiness(process.env)
        .filter((connector) => connector.state === "configured")
        .map((connector) => connector.key as string),
    );
    const countsByKey = new Map(tableCounts);
    const findingsBySource = new Map(findingCounts);

    return CONNECTION_OUTPUTS.map((output) => {
      const counts = countsByKey.get(output.key);
      return {
        key: output.key,
        configured: configured.has(output.key),
        // Null, not zero, when the connection has no store at all: that is a
        // different fact from a store that is empty.
        storedRows: counts?.stored ?? null,
        failedRows: counts?.failed ?? null,
        findings:
          output.findingSources.length === 0
            ? null
            : output.findingSources.reduce(
                (total, source) => total + (findingsBySource.get(source) ?? 0),
                0,
              ),
      };
    });
  });
