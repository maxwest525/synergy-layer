import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/integrations/supabase/types";
import { chunkKnowledgeSource } from "../src/lib/knowledge/chunking";
import { ingestKnowledgeVersion } from "../src/lib/knowledge/runtime.server";
import { loadGovernedKnowledgeSources } from "../src/lib/knowledge/sources";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function approvedRequestCount(args: string[]): number | null {
  const raw = args.find((arg) => arg.startsWith("--approve-model-requests="))?.split("=")[1];
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error("Invalid model request approval.");
  return value;
}

async function main() {
  const live = process.argv.includes("--live");
  const sources = loadGovernedKnowledgeSources();
  const inventory = sources.map((source) => ({
    stableKey: source.stableKey,
    versionLabel: source.versionLabel,
    contentSha256: source.contentSha256,
    sourceSizeBytes: source.sourceSizeBytes,
    chunkCount: chunkKnowledgeSource({ sourceTitle: source.title, content: source.content }).length,
  }));
  const chunkCount = inventory.reduce((total, source) => total + source.chunkCount, 0);
  const modelRequestCount = inventory.reduce(
    (total, source) => total + Math.ceil(source.chunkCount / 50),
    0,
  );
  const summary = {
    mode: live ? "live" : "dry-run",
    sourceCount: sources.length,
    chunkCount,
    modelRequestCount,
    embeddingModel: "gemini-embedding-001",
    dimensions: 768,
    inventory,
  };
  if (!live) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  const approved = approvedRequestCount(process.argv.slice(2));
  if (approved !== modelRequestCount) {
    throw new Error(
      `Live ingestion requires --approve-model-requests=${modelRequestCount}; received ${approved ?? "none"}.`,
    );
  }
  const url = required("SUPABASE_URL");
  const serviceKey =
    process.env["SUPABASE_SERVICE_ROLE_KEY"]?.trim() || required("SUPABASE_SECRET_KEY");
  const apiKey = required("GEMINI_API_KEY");
  const client = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tenantSlug = process.env["AOOS_TENANT_SLUG"]?.trim() || "trumove";
  const { data: tenant, error: tenantError } = await client
    .from("tenants")
    .select("id,slug")
    .eq("slug", tenantSlug)
    .single();
  if (tenantError) throw new Error(tenantError.message);

  const results = [];
  for (const source of sources) {
    results.push(
      await ingestKnowledgeVersion(client, tenant.id, source, {
        apiKey,
        model: process.env["GEMINI_EMBEDDING_MODEL"]?.trim() || "gemini-embedding-001",
        activate: true,
      }),
    );
  }
  process.stdout.write(`${JSON.stringify({ ...summary, results }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown ingestion failure.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
