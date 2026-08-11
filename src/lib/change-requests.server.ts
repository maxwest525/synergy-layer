import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  ACTION_RESULT,
  decideTransition,
  isChangeState,
  recommendationStateFor,
  type ChangeAction,
} from "./change-request-state";
import { logActivity } from "./os.server";

type Client = SupabaseClient<Database>;

export type PostChangeRow = {
  date: string;
  query: string;
  position: number;
  impressions: number;
  clicks: number;
};

type ChangeRow = Database["public"]["Tables"]["change_requests"]["Row"];

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

  const out: PostChangeRow[] = [];
  for (const snapshot of data ?? []) {
    const payload = Array.isArray(snapshot.payload) ? snapshot.payload : [];
    for (const page of payload) {
      const pageRows = (page as { rows?: unknown })?.rows;
      if (!Array.isArray(pageRows)) continue;
      for (const raw of pageRows) {
        const row = raw as { keys?: unknown[]; position?: number; impressions?: number; clicks?: number };
        const keys = Array.isArray(row.keys) ? row.keys : [];
        if (keys[0] !== targetUrl) continue;
        out.push({
          date: snapshot.period_start_pt,
          query: typeof keys[1] === "string" ? keys[1] : "(unknown query)",
          position: Number(row.position ?? 0),
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
        });
      }
    }
  }
  return out;
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
  if (!data) return { changeRequest: null, postChangeRows: [] as PostChangeRow[] };
  const postChangeRows = await fetchPostChangeRows(
    client,
    tenantId,
    data.target_url,
    data.applied_at,
  );
  return { changeRequest: data, postChangeRows };
}

type TransitionInput = {
  id: string;
  action: ChangeAction;
  userId: string;
  notes?: string | null;
  revision?: string | null;
};

/**
 * One transition, server enforced. Invalid moves are refused, replayed clicks
 * are no-ops, and every real move writes an audited activity event carrying the
 * old state, the new state, the actor, the target URL, and the request id.
 */
export async function transitionChangeRequest(
  client: Client,
  input: TransitionInput,
): Promise<{ changeRequest: ChangeRow; changed: boolean }> {
  const { data: existing, error: readError } = await client
    .from("change_requests")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) throw new Error("That change request is not visible to this account.");

  const from = existing.state;
  if (!isChangeState(from)) throw new Error(`Unrecognised change request state: ${from}`);

  const decision = decideTransition(from, input.action);
  if (decision.kind === "invalid") throw new Error(decision.reason);
  if (decision.kind === "noop") return { changeRequest: existing, changed: false };

  const now = new Date().toISOString();
  const patch: Database["public"]["Tables"]["change_requests"]["Update"] = {
    state: ACTION_RESULT[input.action],
  };

  if (input.action === "approve") {
    patch.approved_by = input.userId;
    patch.approved_at = now;
  } else if (input.action === "reject") {
    patch.rejected_by = input.userId;
    patch.rejected_at = now;
  } else if (input.action === "mark_applied") {
    patch.applied_by = input.userId;
    patch.applied_at = now;
    patch.applied_notes = input.notes ?? null;
    if (input.revision) patch.source_revision_after = input.revision;
  } else if (input.action === "verify") {
    patch.verified_by = input.userId;
    patch.verified_at = now;
    patch.verification_notes = input.notes ?? null;
  } else {
    patch.rolled_back_by = input.userId;
    patch.rolled_back_at = now;
    patch.rollback_notes = input.notes ?? null;
  }

  const { data: updated, error } = await client
    .from("change_requests")
    // The state guard makes the write itself idempotent: a concurrent duplicate
    // finds the row already moved and updates nothing.
    .update(patch)
    .eq("id", input.id)
    .eq("state", from)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) {
    const { data: current } = await client
      .from("change_requests")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (!current) throw new Error("That change request is no longer available.");
    return { changeRequest: current, changed: false };
  }

  const nextRecommendationState = recommendationStateFor(decision.to);
  if (updated.recommendation_id && nextRecommendationState) {
    const recommendationPatch: Record<string, unknown> = { state: nextRecommendationState };
    if (input.action === "approve" || input.action === "reject") {
      recommendationPatch["approved_by"] = input.userId;
      recommendationPatch["approved_at"] = now;
    }
    const { error: recError } = await client
      .from("recommendations")
      .update(recommendationPatch as never)
      .eq("id", updated.recommendation_id);
    if (recError) throw new Error(recError.message);
  }

  // The Inbox gate closes only when the change itself is decided. Application,
  // verification, and rollback happen after the decision and leave it closed.
  if ((input.action === "approve" || input.action === "reject") && updated.inbox_item_id) {
    const { error: inboxError } = await client
      .from("inbox_items")
      .update({ lane: "completed", resolved_at: now })
      .eq("id", updated.inbox_item_id)
      .is("resolved_at", null);
    if (inboxError) throw new Error(inboxError.message);
  }

  await logActivity(client, {
    actorKind: "user",
    actorId: input.userId,
    verb: `change_request.${decision.to}`,
    subjectKind: "change_request",
    subjectId: updated.id,
    summary: `${updated.title}: ${from} to ${decision.to}.`,
    payload: {
      changeRequestId: updated.id,
      fromState: from,
      toState: decision.to,
      targetUrl: updated.target_url,
      actorId: input.userId,
    },
    tenantId: updated.tenant_id,
  });

  return { changeRequest: updated, changed: true };
}
