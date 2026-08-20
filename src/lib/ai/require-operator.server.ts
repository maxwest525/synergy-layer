import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type OperatorIdentity = { userId: string; token: string };

/**
 * Streaming routes cannot use the server-function auth middleware, so they
 * verify the bearer token the browser sends the same way it does: claims are
 * checked against the auth server, never trusted from the payload.
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

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Response("Backend is not configured", { status: 500 });
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return { userId: String(data.claims.sub), token };
}
