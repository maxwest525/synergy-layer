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
