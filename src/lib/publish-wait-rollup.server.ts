import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { publishWaitRollup } from "./publish-wait-rollup";

type Client = SupabaseClient<Database>;

/** One module, one source string, so the idempotency read cannot drift from the write. */
const SOURCE_MODULE = "publish-wait";
const SUBJECT_KIND = "publish_wait";

/**
 * Keeps exactly one open needs-attention item for the group of approved
 * changes that are committed and waiting to be proven live, or none.
 *
 * Runs after the daily Search Console observation and after every live page
 * check, the two moments the group can change. The item is keyed on the
 * tenant, so a count that moves rewrites the same item rather than filing a
 * second, and when the group shrinks below two the item completes the same way
 * the transition routine completes an approval's inbox item: lane to
 * completed, resolved now. An operator who cleared it by hand is respected;
 * a cleared item is not reopened, and a new one is filed only when the group
 * has changed since.
 */
export async function reconcilePublishWaitRollup(
  client: Client,
  knownTenantId?: string,
): Promise<{ waiting: number; filed: boolean; updated: boolean; completed: boolean }> {
  const { requireTenantId } = await import("./tenant.server");
  const tenantId = await requireTenantId(client, knownTenantId ?? null);
  const { data: rows, error } = await client
    .from("change_requests")
    .select(
      "id, title, state, target_url, source_commit_sha, source_committed_at, published_proof_at",
    )
    .eq("tenant_id", tenantId)
    .eq("state", "approved");
  if (error) throw new Error(error.message);
  const rollup = publishWaitRollup(rows ?? []);

  const { data: existing, error: existingError } = await client
    .from("inbox_items")
    .select("id, title, resolved_at, cleared_from_lane, metadata")
    .eq("tenant_id", tenantId)
    .eq("source_module", SOURCE_MODULE)
    .eq("subject_kind", SUBJECT_KIND)
    .eq("subject_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  const current = existing?.[0] ?? null;
  const open = current && current.resolved_at === null ? current : null;
  const now = new Date().toISOString();

  if (!rollup) {
    if (!open) return { waiting: 0, filed: false, updated: false, completed: false };
    const { error: completeError } = await client
      .from("inbox_items")
      .update({ lane: "completed", resolved_at: now })
      .eq("id", open.id);
    if (completeError) throw new Error(completeError.message);
    return { waiting: 0, filed: false, updated: false, completed: true };
  }

  const metadata = {
    category: "waiting",
    count: rollup.count,
    changeIds: rollup.changeIds,
    waitingSince: rollup.waitingSince,
  };
  const actions = [{ kind: "review", label: "Open the page changes", href: "/changes" }];

  if (open) {
    const previous =
      open.metadata && typeof open.metadata === "object" && !Array.isArray(open.metadata)
        ? (open.metadata as Record<string, unknown>)
        : {};
    const unchanged =
      previous["count"] === rollup.count &&
      JSON.stringify(previous["changeIds"]) === JSON.stringify(rollup.changeIds);
    if (unchanged) return { waiting: rollup.count, filed: false, updated: false, completed: false };
    const { error: updateError } = await client
      .from("inbox_items")
      .update({
        title: rollup.title,
        summary: rollup.summary,
        metadata: metadata as never,
        actions: actions as never,
      })
      .eq("id", open.id);
    if (updateError) throw new Error(updateError.message);
    return { waiting: rollup.count, filed: false, updated: true, completed: false };
  }

  // A hand-cleared item for the same group stays cleared: only a changed group
  // earns a new one.
  if (current && current.cleared_from_lane !== null) {
    const previous =
      current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {};
    if (JSON.stringify(previous["changeIds"]) === JSON.stringify(rollup.changeIds)) {
      return { waiting: rollup.count, filed: false, updated: false, completed: false };
    }
  }

  const { fileInboxItem, logActivity } = await import("./os.server");
  await fileInboxItem(client, {
    lane: "needs_attention",
    sourceModule: SOURCE_MODULE,
    title: rollup.title,
    summary: rollup.summary,
    priority: 2,
    subjectKind: SUBJECT_KIND,
    subjectId: tenantId,
    actions,
    metadata,
    tenantId,
  });
  await logActivity(client, {
    verb: "change_request.publish_wait_filed",
    subjectKind: SUBJECT_KIND,
    subjectId: tenantId,
    summary: `${rollup.count} approved changes share one blocker, the site publish, and one Inbox item was filed for the group.`,
    payload: { count: rollup.count, changeIds: rollup.changeIds },
    tenantId,
  });
  return { waiting: rollup.count, filed: true, updated: false, completed: false };
}
