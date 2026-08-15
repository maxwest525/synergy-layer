import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/integrations/supabase/types";
import { requireTenantId } from "../tenant.server";
import { chunkKnowledgeSource, KNOWLEDGE_PARSER_VERSION } from "./chunking";
import {
  embedDocuments,
  embedQuery,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
  KNOWLEDGE_EMBEDDING_MODEL,
} from "./embeddings.server";

type Client = SupabaseClient<Database>;
type ChunkInsert = Database["public"]["Tables"]["knowledge_chunks"]["Insert"];

export type KnowledgeSourceInput = {
  stableKey: string;
  title: string;
  description?: string;
  sourceType: "playbook" | "execution_handbook" | "policy" | "research";
  sourceRef: string;
  versionLabel: string;
  content: string;
  metadata?: Record<string, Json | undefined>;
};

type VersionInsert = {
  tenantId: string;
  sourceId: string;
  versionLabel: string;
  contentSha256: string;
  contentText: string;
  sourceSizeBytes: number;
  metadata: Json;
};

type SourceUpsert = Omit<KnowledgeSourceInput, "versionLabel" | "content"> & { tenantId: string };

export type KnowledgeRuntimeStore = {
  upsertSource(input: SourceUpsert): Promise<{ id: string }>;
  findVersion(sourceId: string, checksum: string): Promise<{ id: string; status: string } | null>;
  countChunks(versionId: string): Promise<number>;
  insertVersion(input: VersionInsert): Promise<{ id: string }>;
  insertChunks(rows: ChunkInsert[]): Promise<void>;
  markVersion(versionId: string, status: "embedded" | "failed"): Promise<void>;
  activate(tenantId: string, versionId: string): Promise<void>;
};

type EmbedderInput = {
  apiKey: string;
  documents: { title: string; text: string }[];
  model?: string;
};

type IngestOptions = {
  apiKey: string;
  model?: string;
  activate?: boolean;
  embedder?: (input: EmbedderInput) => Promise<number[][]>;
};

export type GovernedKnowledgeResult = {
  id: string;
  sourceId: string;
  sourceVersionId: string;
  sourceKey: string;
  sourceTitle: string;
  versionLabel: string;
  title: string;
  headingPath: string[];
  body: string;
  sourceRef: string;
  contentSha256: string;
  semanticScore: number;
  lexicalScore: number;
  score: number;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function pgVectorLiteral(vector: number[]): string {
  if (
    vector.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`A valid ${KNOWLEDGE_EMBEDDING_DIMENSIONS}-dimensional vector is required.`);
  }
  return `[${vector.join(",")}]`;
}

export function createKnowledgeRuntimeStore(client: Client): KnowledgeRuntimeStore {
  return {
    async upsertSource(input) {
      const { data, error } = await client
        .from("knowledge_sources")
        .upsert(
          {
            tenant_id: input.tenantId,
            stable_key: input.stableKey,
            title: input.title,
            description: input.description ?? null,
            source_type: input.sourceType,
            source_ref: input.sourceRef,
            metadata: (input.metadata ?? {}) as Json,
            status: "active",
          },
          { onConflict: "tenant_id,stable_key" },
        )
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    async findVersion(sourceId, checksum) {
      const { data, error } = await client
        .from("knowledge_source_versions")
        .select("id,status")
        .eq("source_id", sourceId)
        .eq("content_sha256", checksum)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async countChunks(versionId) {
      const { count, error } = await client
        .from("knowledge_chunks")
        .select("id", { count: "exact", head: true })
        .eq("source_version_id", versionId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async insertVersion(input) {
      const { data, error } = await client
        .from("knowledge_source_versions")
        .insert({
          tenant_id: input.tenantId,
          source_id: input.sourceId,
          version_label: input.versionLabel,
          content_sha256: input.contentSha256,
          content_text: input.contentText,
          source_size_bytes: input.sourceSizeBytes,
          parser_version: KNOWLEDGE_PARSER_VERSION,
          status: "draft",
          embedding_model: KNOWLEDGE_EMBEDDING_MODEL,
          embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
          metadata: input.metadata,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    async insertChunks(rows) {
      for (let offset = 0; offset < rows.length; offset += 100) {
        const { error } = await client
          .from("knowledge_chunks")
          .insert(rows.slice(offset, offset + 100));
        if (error) throw new Error(error.message);
      }
    },
    async markVersion(versionId, status) {
      const { error } = await client
        .from("knowledge_source_versions")
        .update({ status })
        .eq("id", versionId);
      if (error) throw new Error(error.message);
    },
    async activate(tenantId, versionId) {
      const { error } = await client.rpc("activate_knowledge_version", {
        _tenant_id: tenantId,
        _version_id: versionId,
      });
      if (error) throw new Error(error.message);
    },
  };
}

export async function ingestKnowledgeVersionWithStore(
  store: KnowledgeRuntimeStore,
  tenantId: string,
  input: KnowledgeSourceInput,
  options: IngestOptions,
) {
  const normalizedContent = input.content.replace(/\r\n?/g, "\n").trim();
  if (!normalizedContent) throw new Error(`Knowledge source ${input.stableKey} is empty.`);
  const contentSha256 = sha256(normalizedContent);
  const source = await store.upsertSource({
    tenantId,
    stableKey: input.stableKey,
    title: input.title,
    ...(input.description === undefined ? {} : { description: input.description }),
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
  const existing = await store.findVersion(source.id, contentSha256);
  if (existing) {
    return {
      reused: true,
      sourceId: source.id,
      versionId: existing.id,
      chunkCount: await store.countChunks(existing.id),
      active: existing.status === "active",
    };
  }

  const chunks = chunkKnowledgeSource({ sourceTitle: input.title, content: normalizedContent });
  if (chunks.length === 0)
    throw new Error(`Knowledge source ${input.stableKey} produced no chunks.`);
  const embedder = options.embedder ?? embedDocuments;
  const embeddingInput: EmbedderInput = {
    apiKey: options.apiKey,
    documents: chunks.map((chunk) => ({
      title: `${input.title}: ${chunk.headingPath.join(" > ")}`,
      text: chunk.body,
    })),
    ...(options.model === undefined ? {} : { model: options.model }),
  };
  const embeddings = await embedder(embeddingInput);
  if (embeddings.length !== chunks.length) {
    throw new Error("Embedding count does not match the deterministic chunk count.");
  }

  const version = await store.insertVersion({
    tenantId,
    sourceId: source.id,
    versionLabel: input.versionLabel,
    contentSha256,
    contentText: normalizedContent,
    sourceSizeBytes: Buffer.byteLength(normalizedContent, "utf8"),
    metadata: (input.metadata ?? {}) as Json,
  });
  try {
    await store.insertChunks(
      chunks.map((chunk, index) => ({
        tenant_id: tenantId,
        source_version_id: version.id,
        ordinal: chunk.ordinal,
        title: chunk.title,
        heading_path: chunk.headingPath,
        body: chunk.body,
        token_estimate: chunk.tokenEstimate,
        content_sha256: chunk.contentSha256,
        embedding: pgVectorLiteral(embeddings[index]!),
        metadata: {},
      })),
    );
    await store.markVersion(version.id, "embedded");
    if (options.activate) await store.activate(tenantId, version.id);
  } catch (error) {
    await store.markVersion(version.id, "failed");
    throw error;
  }
  return {
    reused: false,
    sourceId: source.id,
    versionId: version.id,
    chunkCount: chunks.length,
    active: Boolean(options.activate),
  };
}

export async function ingestKnowledgeVersion(
  client: Client,
  tenantId: string,
  input: KnowledgeSourceInput,
  options: IngestOptions,
) {
  return ingestKnowledgeVersionWithStore(
    createKnowledgeRuntimeStore(client),
    tenantId,
    input,
    options,
  );
}

export async function retrieveGovernedKnowledge(
  client: Client,
  query: string,
  options: { limit?: number; apiKey?: string; model?: string } = {},
): Promise<GovernedKnowledgeResult[]> {
  const tenantId = await requireTenantId(client);
  const apiKey = options.apiKey ?? process.env["GEMINI_API_KEY"] ?? "";
  const queryVector = await embedQuery({
    apiKey,
    query,
    ...(options.model === undefined ? {} : { model: options.model }),
  });
  const { data, error } = await client.rpc("match_knowledge_chunks", {
    _tenant_id: tenantId,
    _query_embedding: pgVectorLiteral(queryVector),
    _query_text: query,
    _limit: Math.min(Math.max(options.limit ?? 8, 1), 20),
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceVersionId: row.source_version_id,
    sourceKey: row.source_key,
    sourceTitle: row.source_title,
    versionLabel: row.version_label,
    title: row.title,
    headingPath: row.heading_path,
    body: row.body,
    sourceRef: row.source_ref,
    contentSha256: row.content_sha256,
    semanticScore: row.semantic_score,
    lexicalScore: row.lexical_score,
    score: row.score,
  }));
}
