import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { EmptyState, GlassCard, PageHeader, StatePill, formatWhen } from "@/components/os/primitives";
import { getKnowledge } from "@/lib/os.functions";

const knowledgeQuery = { queryKey: ["knowledge"], queryFn: () => getKnowledge() };

export const Route = createFileRoute("/knowledge/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(knowledgeQuery),
  head: () => ({
    meta: [
      { title: "Knowledge — AOOS" },
      {
        name: "description",
        content:
          "The central knowledge layer: documents, repositories, skills, prompts, playbooks, research, and agent memory.",
      },
      { property: "og:title", content: "Knowledge — AOOS" },
      { property: "og:description", content: "Everything the operating system knows, in one layer." },
    ],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const { data } = useSuspenseQuery(knowledgeQuery);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="What the OS knows"
        title="Knowledge"
        description="Collections of documents, repositories, prompts, playbooks, research, and memory that agents read from."
      />

      {data.collections.length === 0 ? (
        <EmptyState title="No collections yet" description="Create a knowledge collection to give agents context." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.collections.map((collection) => {
            const entries = data.entries.filter((entry) => entry.collection_id === collection.id);
            return (
              <Link key={collection.id} to="/knowledge/$id" params={{ id: collection.id }} className="block">
                <GlassCard className="h-full p-5 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{collection.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{collection.key}</p>
                    </div>
                    <StatePill label={collection.kind} tone="primary" />
                  </div>
                  {collection.description ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{collection.description}</p>
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
