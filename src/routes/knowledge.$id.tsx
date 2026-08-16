import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import {
  EmptyState,
  GlassCard,
  PageHeader,
  StatePill,
  formatWhen,
} from "@/components/os/primitives";
import { getKnowledgeCollection } from "@/lib/os.functions";

const collectionQuery = (id: string) => ({
  queryKey: ["knowledge-collection", id],
  queryFn: () => getKnowledgeCollection({ data: { id } }),
});

export const Route = createFileRoute("/knowledge/$id")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(collectionQuery(params.id));
    if (!data.collection) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.collection
      ? `${loaderData.collection.name} — Knowledge — AOOS`
      : "Knowledge collection — AOOS";
    const description =
      loaderData?.collection?.description ?? "Knowledge collection contents in AOOS.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData?.collection ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: KnowledgeCollectionPage,
});

function KnowledgeCollectionPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(collectionQuery(id));
  const collection = data.collection!;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={collection.kind.replace(/_/g, " ")}
        title={collection.name}
        description={collection.description ?? "No description recorded for this collection."}
        actions={<StatePill label={`${data.entries.length} entries`} tone="primary" />}
      />

      {data.entries.length === 0 ? (
        <EmptyState title="No entries" description="This collection has no indexed entries yet." />
      ) : (
        <ul className="space-y-3">
          {data.entries.map((entry) => (
            <li key={entry.id}>
              <GlassCard className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{entry.title}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatWhen(entry.updated_at)}
                  </span>
                </div>
                {entry.body ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{entry.body}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.tags.map((tag) => (
                    <StatePill key={tag} label={tag} />
                  ))}
                  {entry.source_ref ? <StatePill label={entry.source_ref} tone="primary" /> : null}
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}

      <Link to="/knowledge" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to knowledge
      </Link>
    </div>
  );
}
