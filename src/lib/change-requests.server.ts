import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  canVerifyWithEvidence,
  parsePostChangeRows,
  summarizeOutcomeEvidence,
  type PostChangeRow,
} from "./change-request-evidence";
import { type ChangeAction } from "./change-request-state";
import { fetchChangeMeasurementHistory } from "./change-measurements.server";

type Client = SupabaseClient<Database>;

export type { PostChangeRow };

type ChangeRow = Database["public"]["Tables"]["change_requests"]["Row"];
type ChangeVersionRow = Database["public"]["Tables"]["change_request_versions"]["Row"];

/** Post-application Search Console rows for the target page, if any exist yet. */
async function fetchPostChangeRows(
  client: Client,
  tenantId: string,
  targetUrl: string,
  appliedAt: string | null,
): Promise<PostChangeRow[]> {
  if (!appliedAt) return [];
  const day = appliedAt.slice(0, 10);
  const { data, error } = await client
    .from("search_console_snapshots")
    .select("period_start_pt, payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "page_query")
    .gt("period_start_pt", day)
    .order("period_start_pt", { ascending: true })
    .limit(60);
  if (error) throw new Error(error.message);
  return parsePostChangeRows(data ?? [], targetUrl);
}

export async function fetchChangeRequests(client: Client, tenantId: string) {
  const { data, error } = await client
    .from("change_requests")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchChangeRequest(client: Client, tenantId: string, id: string) {
  const { data, error } = await client
    .from("change_requests")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      changeRequest: null,
      postChangeRows: [] as PostChangeRow[],
      versions: [] as ChangeVersionRow[],
      measurement: { cycle: null, windows: [], observations: [], revisions: [] },
    };
  }
  const [{ data: versions, error: versionError }, postChangeRows, measurement] = await Promise.all([
    client
      .from("change_request_versions")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("change_request_id", id)
      .order("version_number", { ascending: false }),
    fetchPostChangeRows(
      client,
      tenantId,
      data.target_url,
      data.applied_at,
    ),
    fetchChangeMeasurementHistory(client, tenantId, id),
  ]);
  if (versionError) throw new Error(versionError.message);
  return { changeRequest: data, postChangeRows, versions: versions ?? [], measurement };
}

/**
 * After each GSC collection, turn an applied change's existing Action Center
 * item from "waiting" into "evidence ready" as soon as finalized page/query
 * rows exist. This never marks the change successful or verified.
 */
export async function reconcileAppliedChangeEvidence(client: Client): Promise<{
  waiting: number;
  ready: number;
  newlyReady: number;
}> {
  const { requireTenantId } = await import("./tenant.server");
  const { logActivity } = await import("./os.server");
  const tenantId = await requireTenantId(client);
  const { data: changes, error: changeError } = await client
    .from("change_requests")
    .select("id, title, target_url, applied_at, inbox_item_id")
    .eq("tenant_id", tenantId)
    .eq("state", "applied")
    .not("applied_at", "is", null)
    .not("inbox_item_id", "is", null);
  if (changeError) throw new Error(changeError.message);
  if (!changes || changes.length === 0) return { waiting: 0, ready: 0, newlyReady: 0 };

  const firstAppliedDay = changes
    .map((change) => change.applied_at!.slice(0, 10))
    .sort()[0]!;
  const { data: snapshots, error: snapshotError } = await client
    .from("search_console_snapshots")
    .select("period_start_pt, payload")
    .eq("tenant_id", tenantId)
    .eq("kind", "page_query")
    .gt("period_start_pt", firstAppliedDay)
    .order("period_start_pt", { ascending: true })
    .limit(120);
  if (snapshotError) throw new Error(snapshotError.message);

  let ready = 0;
  let newlyReady = 0;
  for (const change of changes) {
    const appliedDay = change.applied_at!.slice(0, 10);
    const relevantSnapshots = (snapshots ?? []).filter(
      (snapshot) => snapshot.period_start_pt > appliedDay,
    );
    const outcome = summarizeOutcomeEvidence(
      parsePostChangeRows(relevantSnapshots, change.target_url),
    );
    if (!outcome.ready) continue;
    ready += 1;

    const { data: current, error: itemError } = await client
      .from("inbox_items")
      .select("title, metadata")
      .eq("tenant_id", tenantId)
      .eq("id", change.inbox_item_id!)
      .maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!current) continue;
    const alreadyReady = current.title.startsWith("Review outcome evidence:");
    const metadata =
      current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata
        : {};
    const { error: updateError } = await client
      .from("inbox_items")
      .update({
        lane: "needs_attention",
        resolved_at: null,
        title: `Review outcome evidence: ${change.title}`,
        summary: outcome.summary,
        actions: [
          {
            kind: "review",
            label: "Review outcome evidence",
            href: `/changes/${change.id}`,
          },
        ],
        metadata: {
          ...metadata,
          outcomeEvidence: {
            rowCount: outcome.rowCount,
            firstDate: outcome.firstDate,
            latestDate: outcome.latestDate,
            ready: true,
          },
        },
      })
      .eq("tenant_id", tenantId)
      .eq("id", change.inbox_item_id!);
    if (updateError) throw new Error(updateError.message);

    if (!alreadyReady) {
      newlyReady += 1;
      await logActivity(client, {
        verb: "change_request.outcome_evidence_ready",
        subjectKind: "change_request",
        subjectId: change.id,
        summary: outcome.summary,
        payload: {
          targetUrl: change.target_url,
          rowCount: outcome.rowCount,
          firstDate: outcome.firstDate,
          latestDate: outcome.latestDate,
        },
      });
    }
  }

  return { waiting: changes.length - ready, ready, newlyReady };
}

type TransitionInput = {
  id: string;
  action: ChangeAction;
  userId: string;
  notes?: string | null;
  revision?: string | null;
};

/**
 * One transition, executed by a single database routine so the state guard, the
 * actor stamps, the linked recommendation, the Inbox gate, and the audit event
 * either all land or none of them do. The routine also rechecks stored Search
 * Console snapshots itself before allowing verification, so no browser flag can
 * declare evidence that does not exist.
 */
export async function transitionChangeRequest(
  client: Client,
  input: TransitionInput,
): Promise<{ changeRequest: ChangeRow; changed: boolean }> {
  if (input.action === "verify") {
    const { data: existing, error: readError } = await client
      .from("change_requests")
      .select("tenant_id, target_url, applied_at")
      .eq("id", input.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("That change request is not visible to this account.");
    const postChangeRows = await fetchPostChangeRows(
      client,
      existing.tenant_id,
      existing.target_url,
      existing.applied_at,
    );
    if (!canVerifyWithEvidence({ appliedAt: existing.applied_at, postChangeRows })) {
      throw new Error(
        "Waiting for finalized post-change Search Console data. No data is not evidence of success.",
      );
    }
  }

  const args: { _id: string; _action: string; _notes?: string; _revision?: string } = {
    _id: input.id,
    _action: input.action,
  };
  if (input.notes) args._notes = input.notes;
  if (input.revision) args._revision = input.revision;

  const { data, error } = await client.rpc("transition_change_request", args);

  if (error) throw new Error(error.message);

  const result = (data ?? {}) as { changed?: boolean; change_request?: ChangeRow };
  if (!result.change_request) throw new Error("That change request is no longer available.");
  return { changeRequest: result.change_request, changed: Boolean(result.changed) };
}
