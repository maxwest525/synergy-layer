import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type AgentRunResult = {
  agent: string;
  state: "succeeded" | "awaiting_approval" | "failed";
  summary: string;
};

/**
 * Runtime agents are outside the temporary AOOS build. Refuse before touching
 * storage so the UI cannot manufacture success or an approval nobody can resume.
 */
export async function runAgent(
  _client: Client,
  _agentId: string,
  _userId: string,
): Promise<AgentRunResult> {
  throw new Error(
    "Runtime agents are intentionally disabled. AOOS currently runs explicit automation and operator workflows only.",
  );
}
