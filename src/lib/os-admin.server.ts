import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { fileInboxItem, logActivity } from "./os.server";

type Client = SupabaseClient<Database>;

export async function assertOperator(client: Client, userId: string): Promise<void> {
  const { data, error } = await client.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const allowed = (data ?? []).some((row) => row.role === "admin" || row.role === "operator");
  if (!allowed) throw new Error("Operator or admin role required for this action.");
}

export async function decide(
  client: Client,
  id: string,
  decision: "approved" | "rejected",
  userId: string,
) {
  const { describeSuggestedAction, isObservationOnly } = await import("./recommendation-action");

  const { data: existing, error: readError } = await client
    .from("recommendations")
    .select("id, title, state, metadata, suggested_action")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) throw new Error("That recommendation is not visible to this account.");

  // Facts are not approvals. An observation records what the SERP showed; it
  // is not a proposal, so it can never be approved or rejected.
  if (isObservationOnly(existing.metadata)) {
    throw new Error(
      "This row is observed evidence, not a proposal. Observations cannot be approved or rejected.",
    );
  }
  if (existing.state === "observed") {
    throw new Error("Observed evidence cannot be approved or rejected.");
  }
  if (existing.state === "approved" || existing.state === "rejected") {
    throw new Error(`This recommendation was already ${existing.state}.`);
  }
  if (!describeSuggestedAction(existing.suggested_action).executable) {
    throw new Error(
      "No executable handler is connected to this suggested action, so approving it would record a decision that runs nothing.",
    );
  }

  const { data: recommendation, error } = await client
    .from("recommendations")
    .update({ state: decision, approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const { error: inboxError } = await client
    .from("inbox_items")
    .update({ lane: "completed", resolved_at: new Date().toISOString() })
    .eq("subject_id", id)
    .is("resolved_at", null);
  if (inboxError) throw new Error(inboxError.message);

  await logActivity(client, {
    actorKind: "user",
    actorId: userId,
    verb: `recommendation.${decision}`,
    subjectKind: "recommendation",
    subjectId: id,
    summary: `${recommendation.title} was ${decision}.`,
  });

  return recommendation;
}

/**
 * Set a suggestion aside, or take it back.
 *
 * This is not `decide`. It records that the operator does not want to see the
 * row now; it authorises nothing and runs nothing, so it is not gated on there
 * being an executable handler. `approved_at` and `approved_by` are deliberately
 * left alone: nobody approved anything.
 */
export async function setQueueState(
  client: Client,
  id: string,
  verb: "ignore" | "restore",
  userId: string,
) {
  const { isObservationOnly } = await import("./recommendation-action");
  const { nextRecommendationState } = await import("./recommendation-queue-state");

  const { data: existing, error: readError } = await client
    .from("recommendations")
    .select("id, title, state, metadata")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) throw new Error("That suggestion is not visible to this account.");

  const write = nextRecommendationState(verb, existing.state, isObservationOnly(existing.metadata));
  if (!write.ok) throw new Error(write.reason);

  const { data: updated, error } = await client
    .from("recommendations")
    .update({ state: write.nextState })
    .eq("id", id)
    .select("id, state")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(client, {
    actorKind: "user",
    actorId: userId,
    verb: `recommendation.${verb}`,
    subjectKind: "recommendation",
    subjectId: id,
    summary:
      verb === "ignore"
        ? `${existing.title} was set aside.`
        : `${existing.title} was put back on the list.`,
  });

  return updated;
}

/**
 * Clearing is one atomic operator action in the database: it preserves the
 * prior lane, records who cleared it, and logs the event. Pending approvals are
 * rejected there, not here, so no client can route around the gate.
 */
export async function resolveItem(client: Client, id: string) {
  const { data, error } = await client.rpc("clear_inbox_item", { _item_id: id });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Clearing the inbox item returned no row.");
  return data;
}

/** Undo a manual clear. Approved, rejected, and system completed items stay closed. */
export async function reopenItem(client: Client, id: string) {
  const { data, error } = await client.rpc("reopen_inbox_item", { _item_id: id });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Reopening the inbox item returned no row.");
  return data;
}

export { fileInboxItem, logActivity };
