import { createRequestClient, resolveTenantId } from "../tenant.server";

export async function fetchGovernedKnowledge() {
  const { db, authenticated } = createRequestClient();
  const tenantId = authenticated ? await resolveTenantId(db) : null;
  if (!tenantId) return { sources: [], versions: [], chunks: [] };

  const [sourcesResult, versionsResult, chunksResult] = await Promise.all([
    db
      .from("knowledge_sources")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("source_type")
      .order("title"),
    db
      .from("knowledge_source_versions")
      .select(
        "id,source_id,version_label,content_sha256,source_size_bytes,status,embedding_model,embedding_dimensions,activated_at,deactivated_at,created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    db
      .from("knowledge_chunks")
      .select(
        "id,source_version_id,ordinal,title,heading_path,body,token_estimate,content_sha256,created_at",
      )
      .eq("tenant_id", tenantId)
      .order("source_version_id")
      .order("ordinal"),
  ]);
  if (sourcesResult.error) throw new Error(sourcesResult.error.message);
  if (versionsResult.error) throw new Error(versionsResult.error.message);
  if (chunksResult.error) throw new Error(chunksResult.error.message);
  return {
    sources: sourcesResult.data ?? [],
    versions: versionsResult.data ?? [],
    chunks: chunksResult.data ?? [],
  };
}

export async function fetchExecutionManual() {
  const data = await fetchGovernedKnowledge();
  const sources = data.sources.filter((source) => source.source_type === "execution_handbook");
  const sourceIds = new Set(sources.map((source) => source.id));
  const versions = data.versions.filter(
    (version) => sourceIds.has(version.source_id) && version.status === "active",
  );
  const versionIds = new Set(versions.map((version) => version.id));
  return {
    sources,
    versions,
    chunks: data.chunks.filter((chunk) => versionIds.has(chunk.source_version_id)),
  };
}
