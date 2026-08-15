import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ingestionApproval = z.object({ approvedModelRequests: z.literal(18) });

export const getGovernedKnowledge = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchGovernedKnowledge } = await import("./queries.server");
  return fetchGovernedKnowledge();
});

export const getExecutionManual = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchExecutionManual } = await import("./queries.server");
  return fetchExecutionManual();
});

export const ingestAndActivateGovernedKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => ingestionApproval.parse(value))
  .handler(async ({ context }) => {
    const { assertOperator } = await import("../os-admin.server");
    const { requireTenantId } = await import("../tenant.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ingestKnowledgeVersion } = await import("./runtime.server");
    const { loadGovernedKnowledgeSources } = await import("./sources");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const apiKey = process.env["GEMINI_API_KEY"]?.trim() ?? "";
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const sources = loadGovernedKnowledgeSources();
    if (sources.length !== 18) {
      throw new Error(`Expected exactly 18 governed sources; found ${sources.length}.`);
    }
    const results = [];
    for (const source of sources) {
      results.push(
        await ingestKnowledgeVersion(supabaseAdmin, tenantId, source, {
          apiKey,
          activate: true,
        }),
      );
    }
    return {
      sourceCount: results.length,
      embeddedChunkCount: results.reduce((total, result) => total + result.chunkCount, 0),
      reusedSourceCount: results.filter((result) => result.reused).length,
      modelRequestCeiling: 18,
    };
  });
