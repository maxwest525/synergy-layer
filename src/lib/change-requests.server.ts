import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  canVerifyWithEvidence,
  parsePostChangeRows,
  type PostChangeRow,
} from "./change-request-evidence";
import { type ChangeAction } from "./change-request-state";

type Client = SupabaseClient<Database>;

export type { PostChangeRow };

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
