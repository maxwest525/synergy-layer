import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export function validateKnowledgeIngestionApproval(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>)["approvedModelRequests"] !== 18
  ) {
    throw new Error("Knowledge ingestion requires approval for exactly 18 model requests.");
  }
  return { approvedModelRequests: 18 as const };
}

export function validateKnowledgeEmbeddingProbeApproval(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>)["approvedModelRequests"] !== 1
  ) {
    throw new Error("Knowledge embedding probe requires approval for exactly 1 model request.");
  }
  return { approvedModelRequests: 1 as const };
}

export function validateOutcomeMemoryApproval(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as Record<string, unknown>)["approvedModelRequests"] !== 1
  ) {
    throw new Error("Outcome-memory ingestion requires approval for exactly 1 model request.");
  }
  return { approvedModelRequests: 1 as const };
}

export const getGovernedKnowledge = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchGovernedKnowledge } = await import("./queries.server");
  return fetchGovernedKnowledge();
});

export const getExecutionManual = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchExecutionManual } = await import("./queries.server");
  return fetchExecutionManual();
});

export const probeGovernedKnowledgeEmbedding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateKnowledgeEmbeddingProbeApproval)
  .handler(async ({ context }) => {
    const { assertOperator } = await import("../os-admin.server");
    const { litellmConfigured } = await import("../ai/routing");
    const { embedQuery, KNOWLEDGE_EMBEDDING_MODEL } = await import("./embeddings.server");
    const { requireTenantId } = await import("../tenant.server");
    await assertOperator(context.supabase, context.userId);
    const apiKey = process.env["GEMINI_API_KEY"]?.trim() ?? "";
    if (!apiKey && !litellmConfigured(process.env)) {
      throw new Error("Neither GEMINI_API_KEY nor the LiteLLM proxy is configured.");
    }
    const tenantId = await requireTenantId(context.supabase);
    const vector = await embedQuery({
      apiKey,
      query: "AOOS governed knowledge connector health probe",
      client: context.supabase,
      tenantId,
    });
    return {
      model: KNOWLEDGE_EMBEDDING_MODEL,
      dimensions: vector.length,
      modelRequestCount: 1 as const,
    };
  });

export const ingestAndActivateGovernedKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateKnowledgeIngestionApproval)
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

    const sources = loadGovernedKnowledgeSources({ bundled: true });
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

/**
 * Writes the site's own concluded outcomes into the governed store, so
 * proposal drafting can retrieve what actually happened here alongside the
 * playbooks. One source, content-addressed: an unchanged history is reused
 * (no model request is spent), and an empty history ingests nothing and says
 * so instead of embedding an empty document.
 */
export const ingestOutcomeMemoryKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateOutcomeMemoryApproval)
  .handler(async ({ context }) => {
    const { assertOperator } = await import("../os-admin.server");
    const { requireTenantId } = await import("../tenant.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ingestKnowledgeVersion } = await import("./runtime.server");
    const { fetchStoredOutcomes } = await import("../change-outcomes.server");
    const { gradeOutcomes } = await import("../site-health");
    const { readPageAudit } = await import("../page-audit.server");
    const { composeOutcomeMemorySource } = await import("./outcome-sources");
    await assertOperator(context.supabase, context.userId);
    const tenantId = await requireTenantId(context.supabase);
    const apiKey = process.env["GEMINI_API_KEY"]?.trim() ?? "";
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const audit = await readPageAudit(context.supabase, tenantId);
    const { outcomes, truncated } = await fetchStoredOutcomes(
      context.supabase,
      tenantId,
      new Date().toISOString(),
      audit.property,
    );
    const source = composeOutcomeMemorySource(gradeOutcomes(outcomes));
    if (source === null) {
      return {
        ingested: false as const,
        reason: "No stored reading has concluded yet, so there is no history to remember.",
        concludedReadings: 0,
        truncated,
      };
    }
    const result = await ingestKnowledgeVersion(supabaseAdmin, tenantId, source, {
      apiKey,
      activate: true,
    });
    return {
      ingested: true as const,
      concludedReadings: source.metadata?.["concludedReadings"] ?? null,
      chunkCount: result.chunkCount,
      reused: result.reused,
      truncated,
      modelRequestCeiling: 1,
    };
  });
