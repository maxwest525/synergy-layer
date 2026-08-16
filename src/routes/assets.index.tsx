import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import {
  EmptyState,
  GlassCard,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { getAssets } from "@/lib/os.functions";

const assetsQuery = { queryKey: ["assets"], queryFn: () => getAssets() };

export const Route = createFileRoute("/assets/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: ({ context }) => {
    // Warm the cache without blocking navigation; the suspense boundary
    // renders the pending surface immediately.
    void context.queryClient.prefetchQuery(assetsQuery);
  },
  head: () => ({
    meta: [
      { title: "Assets — AOOS" },
      {
        name: "description",
        content:
          "Every owned marketing asset: sites, landing pages, ad accounts, repositories, backends, datasets, and knowledge collections.",
      },
      { property: "og:title", content: "Assets — AOOS" },
      { property: "og:description", content: "Everything the company owns, in one registry." },
    ],
  }),
  component: AssetsPage,
});

function AssetsPage() {
  const { data } = useSuspenseQuery(assetsQuery);
  const groups = Array.from(new Set(data.map((asset) => asset.kind)));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ownership"
        title="Assets"
        description="Sites, landing pages, ad accounts, repositories, backends, datasets, and collections — with owner, health, and last touch."
      />

      {data.length === 0 ? (
        <EmptyState
          title="No assets registered"
          description="Register an asset to bring it under the OS."
        />
      ) : (
        groups.map((kind) => (
          <section key={kind} className="space-y-4">
            <h2 className="text-sm font-semibold capitalize tracking-tight text-foreground">
              {kind.replace(/_/g, " ")}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {data
                .filter((asset) => asset.kind === kind)
                .map((asset) => (
                  <Link key={asset.id} to="/assets/$id" params={{ id: asset.id }} className="block">
                    <GlassCard className="h-full p-5 transition-colors hover:border-primary/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {asset.name}
                          </p>
                          {asset.description ? (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {asset.description}
                            </p>
                          ) : null}
                        </div>
                        <StatePill label={asset.health} tone={toneForState(asset.health)} />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatePill label={asset.status} tone={toneForState(asset.status)} />
                        {asset.owner_label ? <StatePill label={asset.owner_label} /> : null}
                        <span className="text-xs text-muted-foreground">
                          Updated {formatWhen(asset.updated_at)}
                        </span>
                      </div>
                    </GlassCard>
                  </Link>
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
