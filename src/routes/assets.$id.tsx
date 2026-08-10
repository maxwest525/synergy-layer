import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { DataForSeoPanel } from "@/components/os/dataforseo-panel";
import { DetailRow, GlassCard, PageHeader, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { SearchConsolePanel } from "@/components/os/search-console-panel";
import { getAsset } from "@/lib/os.functions";

const assetQuery = (id: string) => ({ queryKey: ["asset", id], queryFn: () => getAsset({ data: { id } }) });

export const Route = createFileRoute("/assets/$id")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(assetQuery(params.id));
    if (!data.asset) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.asset ? `${loaderData.asset.name} — Assets — AOOS` : "Asset — AOOS";
    const description = loaderData?.asset?.description ?? "Asset detail, health, and history in AOOS.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData?.asset ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: AssetDetailPage,
});

function AssetDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(assetQuery(id));
  const asset = data.asset!;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={asset.kind.replace(/_/g, " ")}
        title={asset.name}
        description={asset.description ?? "No description recorded for this asset yet."}
        actions={<StatePill label={asset.health} tone={toneForState(asset.health)} />}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Record</h2>
          <dl className="mt-3">
            <DetailRow label="Status" value={<StatePill label={asset.status} tone={toneForState(asset.status)} />} />
            <DetailRow label="Owner" value={asset.owner_label ?? "Unassigned"} />
            <DetailRow label="External reference" value={asset.external_ref ?? "None"} />
            <DetailRow label="Last updated" value={formatWhen(asset.updated_at)} />
          </dl>
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          {data.activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No recorded activity for this asset yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.activity.map((event) => (
                <li key={event.id} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <StatePill label={event.verb} tone="primary" />
                    <span className="text-xs text-muted-foreground">{formatWhen(event.occurred_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{event.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {asset.kind === "website" ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Observation evidence for this asset
          </h2>
          <p className="text-sm text-muted-foreground">
            Search Console and DataForSEO collect against this property. Every snapshot below was paid
            for and stored immutably.
          </p>
          <SearchConsolePanel />
          <DataForSeoPanel />
        </section>
      ) : null}

      <Link to="/assets" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to assets
      </Link>
    </div>
  );
}
