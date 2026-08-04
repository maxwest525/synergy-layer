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
  const { data: recommendation, error } = await client
    .from("recommendations")
    .update({ state: decision, approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await client
    .from("inbox_items")
    .update({ lane: "completed", resolved_at: new Date().toISOString() })
    .eq("subject_id", id)
    .is("resolved_at", null);

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

export async function resolveItem(client: Client, id: string, userId: string) {
  const { data, error } = await client
    .from("inbox_items")
    .update({ lane: "completed", resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(client, {
    actorKind: "user",
    actorId: userId,
    verb: "inbox.resolved",
    subjectKind: "inbox_item",
    subjectId: id,
    summary: `Inbox item "${data.title}" was cleared.`,
  });

  return data;
}

export { fileInboxItem, logActivity };
