import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  EmptyState,
  GlassCard,
  PageHeader,
  StatePill,
  formatWhen,
} from "@/components/os/primitives";
import { getKnowledge } from "@/lib/os.functions";
import { Button } from "@/components/ui/button";
import {
  getGovernedKnowledge,
  ingestAndActivateGovernedKnowledge,
  probeGovernedKnowledgeEmbedding,
} from "@/lib/knowledge/functions";

const knowledgeQuery = { queryKey: ["knowledge"], queryFn: () => getKnowledge() };

export const Route = createFileRoute("/knowledge/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: ({ context }) => {
    // Warm the cache without blocking navigation; the suspense boundary
    // renders the pending surface immediately.
    void context.queryClient.prefetchQuery(knowledgeQuery);
  },
  head: () => ({
    meta: [
      { title: "Knowledge — AOOS" },
      {
        name: "description",
        content:
          "The central knowledge layer: documents, repositories, skills, prompts, playbooks, research, and agent memory.",
      },
      { property: "og:title", content: "Knowledge — AOOS" },
      {
        property: "og:description",
        content: "Everything the operating system knows, in one layer.",
      },
    ],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const { data } = useSuspenseQuery(knowledgeQuery);
  const loadGoverned = useServerFn(getGovernedKnowledge);
  const ingestGoverned = useServerFn(ingestAndActivateGovernedKnowledge);
  const probeEmbedding = useServerFn(probeGovernedKnowledgeEmbedding);
  const queryClient = useQueryClient();
  const governed = useSuspenseQuery({
    queryKey: ["governed-knowledge"],
    queryFn: () => loadGoverned(),
    retry: false,
  });
  const activeVersions = governed.data.versions.filter((version) => version.status === "active");
  const activeVersionIds = new Set(activeVersions.map((version) => version.id));
  const activeChunks = governed.data.chunks.filter((chunk) =>
    activeVersionIds.has(chunk.source_version_id),
  );
  const ingestion = useMutation({
    mutationFn: () => ingestGoverned({ data: { approvedModelRequests: 18 } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["governed-knowledge"] });
      toast.success(
        `Activated ${result.sourceCount} sources and ${result.embeddedChunkCount} embedded chunks.`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const embeddingProbe = useMutation({
    mutationFn: () => probeEmbedding({ data: { approvedModelRequests: 1 } }),
    onSuccess: (result) => {
      toast.success(`Gemini embedding healthy: ${result.model} · ${result.dimensions} dimensions.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="What the OS knows"
        title="Knowledge"
        description="Collections of documents, repositories, prompts, playbooks, research, and memory that agents read from. Governed sources below are versioned, chunked, embedded, and activated separately from legacy entries."
        actions={
          <Button asChild>
            <Link to="/knowledge/manual">Open Execution Handbook</Link>
          </Button>
        }
      />

      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Runtime knowledge activation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Only chunks belonging to an active immutable source version are eligible for proposal
              retrieval and Authority Science decisions.
            </p>
          </div>
          <StatePill
            label={activeChunks.length ? "runtime active" : "not activated"}
            tone={activeChunks.length ? "success" : "warning"}
          />
        </div>
        {!activeChunks.length ? (
          <div className="mt-4 rounded-xl border border-border/60 p-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              This operator action makes at most 18 Gemini embedding requests, then stores and
              activates the immutable source versions. It does not run automatically or in the
              background.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={embeddingProbe.isPending || ingestion.isPending}
                onClick={() => embeddingProbe.mutate()}
              >
                {embeddingProbe.isPending ? "Testing Gemini…" : "Test Gemini · exactly 1 request"}
              </Button>
              <Button disabled={ingestion.isPending} onClick={() => ingestion.mutate()}>
                {ingestion.isPending
                  ? "Embedding and activating…"
                  : "Ingest and activate · maximum 18 requests"}
              </Button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Governed sources</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {governed.data.sources.length}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Active versions</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{activeVersions.length}</p>
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">Active embedded chunks</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{activeChunks.length}</p>
          </div>
        </div>
        {governed.data.sources.length ? (
          <ul className="mt-4 space-y-2">
            {governed.data.sources.map((source) => {
              const version = activeVersions.find((item) => item.source_id === source.id);
              const chunks = version
                ? activeChunks.filter((chunk) => chunk.source_version_id === version.id).length
                : 0;
              return (
                <li
                  key={source.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span className="text-foreground">{source.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {version
                      ? `${version.version_label} · ${chunks} chunks · ${version.embedding_model}`
                      : "no active version"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </GlassCard>

      {data.collections.length === 0 ? (
        <EmptyState
          title="No collections yet"
          description="Create a knowledge collection to give agents context."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.collections.map((collection) => {
            const entries = data.entries.filter((entry) => entry.collection_id === collection.id);
            return (
              <Link
                key={collection.id}
                to="/knowledge/$id"
                params={{ id: collection.id }}
                className="block"
              >
                <GlassCard className="h-full p-5 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {collection.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{collection.key}</p>
                    </div>
                    <StatePill label={collection.kind} tone="primary" />
                  </div>
                  {collection.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {collection.description}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-muted-foreground">
                    {entries.length} entries · updated {formatWhen(collection.updated_at)}
                  </p>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
