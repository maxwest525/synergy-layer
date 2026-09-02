import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { supabasePublicUrl, supabasePublishableKey } from "@/integrations/supabase/public-config";

export type OperatorIdentity = { userId: string; token: string };

/** True when any row carries a role that may spend or act. Pure, for tests. */
export function hasOperatorRole(rows: readonly { role: string }[]): boolean {
  return rows.some((row) => row.role === "admin" || row.role === "operator");
}

/**
 * Streaming routes cannot use the server-function auth middleware, so they
 * verify the bearer token the browser sends the same way it does: claims are
 * checked against the auth server, never trusted from the payload.
 *
 * Identity is not authority. Sign-up on the auth project is open and a
 * signed-in account without a role is a legitimate read-only session, so the
 * role is read back through the caller's own token (the user_roles policy
 * lets a user read only their own rows) and a non-operator is refused with
 * 403 before any model call is made. The server-function paths do the same
 * through assertOperator; this is the equivalent for raw request handlers.
 */
export async function requireOperatorFromRequest(request: Request): Promise<OperatorIdentity> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (token.split(".").length !== 3) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const url = supabasePublicUrl();
  const key = supabasePublishableKey();
  if (!url || !key) {
    throw new Response("Backend is not configured", { status: 500 });
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const userId = String(data.claims.sub);

  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (rolesError || !hasOperatorRole(roles ?? [])) {
    throw new Response("Operator or admin role required for this action.", { status: 403 });
  }
  return { userId, token };
}
