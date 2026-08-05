import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type ProvisionOutcome = {
  status: "provisioned" | "unchanged" | "not_allowlisted" | "unverified" | "unknown_user";
  role: Database["public"]["Enums"]["app_role"] | null;
};

/**
 * Runs the server-side allowlist provisioning routine for a signed-in user.
 * The routine is security definer and only callable with service credentials,
 * so no client can grant itself a role.
 */
export async function provisionUser(userId: string): Promise<ProvisionOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("provision_operator_from_allowlist", {
    _auth_user_id: userId,
  });
  if (error) throw new Error(error.message);

  const result = String(data ?? "unknown_user");
  if (result.startsWith("provisioned:")) {
    return {
      status: "provisioned",
      role: result.split(":")[1] as Database["public"]["Enums"]["app_role"],
    };
  }
  return { status: result as ProvisionOutcome["status"], role: null };
}

export async function currentRoles(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Database["public"]["Enums"]["app_role"][]> {
  const { data, error } = await client.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.role);
}

export async function recordAuthEvent(
  userId: string,
  verb: string,
  summary: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("activity_events").insert({
    actor_kind: "user",
    actor_id: userId,
    verb,
    subject_kind: "user",
    subject_id: userId,
    summary,
    payload: payload as never,
  });
}
