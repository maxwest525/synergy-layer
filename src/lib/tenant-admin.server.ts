import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { logActivity } from "./os.server";

type Client = SupabaseClient<Database>;

export type NewTenantInput = { name: string; slug: string; description?: string | undefined };

/**
 * Creates a client workspace and enrols the creator as its owner. The insert
 * runs as the operator, so row level security still decides whether they may
 * create workspaces at all.
 */
export async function createTenantWorkspace(
  client: Client,
  userId: string,
  input: NewTenantInput,
): Promise<{ id: string; slug: string; name: string }> {
  const { data: existing } = await client.from("tenants").select("id").eq("slug", input.slug).maybeSingle();
  if (existing) throw new Error(`A client workspace with the slug "${input.slug}" already exists.`);

  const { data, error } = await client
    .from("tenants")
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
    })
    .select("id, slug, name")
    .single();
  if (error) throw new Error(error.message);

  const { error: memberError } = await client
    .from("tenant_members")
    .insert({ tenant_id: data.id, user_id: userId, role: "admin" });
  if (memberError) throw new Error(memberError.message);

  await client.from("profiles").update({ active_tenant_id: data.id }).eq("id", userId);

  await logActivity(client, {
    tenantId: data.id,
    actorKind: "user",
    actorId: userId,
    verb: "tenant.created",
    subjectKind: "tenant",
    subjectId: data.id,
    summary: `Client workspace ${data.name} created.`,
    payload: { slug: data.slug },
  });

  return data;
}
