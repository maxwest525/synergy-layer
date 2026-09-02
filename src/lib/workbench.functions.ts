import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { isChangeState } from "./change-request-state";
import { type Bench, type BenchChange, type BenchFinding, buildBench } from "./workbench";

export type BenchView = Bench & {
  actionable: number;
  blockedCount: number;
  total: number;
};

/**
 * Everything the bench shows, through the caller's own client so row level
 * security decides what they see rather than this function.
 *
 * Findings and changes are read whole rather than counted in SQL: the bucketing
 * is pure and tested (`workbench.ts`), and a count computed a second way in a
 * query is how the "waiting" numbers came to disagree with the lists under them
 * (CODE-32).
 */
export const getBench = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BenchView> => {
    const { requireTenantId } = await import("./tenant.server");
    const tenantId = await requireTenantId(context.supabase);

    const [findingRows, changeRows] = await Promise.all([
      context.supabase
        .from("recommendations")
        .select("id, title, source_module, metadata, suggested_action, created_at, state")
        .eq("tenant_id", tenantId)
        // Everything still open. A rejected or rolled back finding is a decision
        // already taken, and the bench is a list of decisions still to take.
        .in("state", ["observed", "proposed", "draft", "under_review"])
        .order("created_at", { ascending: false })
        .limit(1000),
      context.supabase
        .from("change_requests")
        .select(
          "id, recommendation_id, title, state, source_commit_sha, published_proof_at, updated_at",
        )
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);

    if (findingRows.error) {
      throw new Error(`Could not read the findings: ${findingRows.error.message}`);
    }
    if (changeRows.error) {
      throw new Error(`Could not read the changes: ${changeRows.error.message}`);
    }

    const findings: BenchFinding[] = (findingRows.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      // The rule is stored on the metadata of most writers and on the suggested
      // action of the older ones. Neither is guaranteed, and a row carrying
      // neither is kept apart rather than guessed at.
      rule: ruleOf(row.metadata) ?? ruleOf(row.suggested_action),
      sourceModule: row.source_module,
      createdAt: row.created_at,
    }));

    const changes: BenchChange[] = (changeRows.data ?? []).flatMap((row) => {
      if (!isChangeState(row.state)) return [];
      return [
        {
          id: row.id,
          recommendationId: row.recommendation_id,
          title: row.title,
          state: row.state,
          committedSha: row.source_commit_sha,
          provenAt: row.published_proof_at,
          updatedAt: row.updated_at,
        },
      ];
    });

    const bench = buildBench({ findings, changes });
    const { benchCoverage } = await import("./workbench");
    return { ...bench, ...benchCoverage(bench) };
  });

function ruleOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const rule = (value as Record<string, unknown>)["rule"];
  return typeof rule === "string" && rule !== "" ? rule : null;
}
