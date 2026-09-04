import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { describeModelRouting } from "./routing";

/**
 * Which service a model call would go to right now, read from the host's own
 * environment. Names and a sentence, never a key value.
 *
 * `describeModelRouting` was written, exported and tested and called by
 * nothing, so the operator had no way to tell whether their own OpenRouter key
 * was carrying the traffic or whether the call had quietly fallen back to the
 * Lovable gateway or straight to Google. Two connector-placed variables decide
 * it, and AGENTS.md records that a connector variable can read as absent in the
 * settings list while the running deployment still holds it. The settings
 * screen therefore cannot answer this; only the host can.
 */
export const getModelRouting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ provider: string | null; statement: string }> => {
    const routing = describeModelRouting(process.env);
    return { provider: routing.provider, statement: routing.statement };
  });
