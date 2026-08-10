import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { DetailRow, GlassCard, PageHeader, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { DataForSeoPanel } from "@/components/os/dataforseo-panel";
import { McpPanel } from "@/components/os/mcp-panel";
import { SearchConsolePanel } from "@/components/os/search-console-panel";

import { getCapability } from "@/lib/os.functions";

const capabilityQuery = (id: string) => ({
  queryKey: ["capability", id],
  queryFn: () => getCapability({ data: { id } }),
});

type Operation = { name: string; description?: string; mutates?: boolean };

export const Route = createFileRoute("/capabilities/$id")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(capabilityQuery(params.id));
    if (!data.capability) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.capability
      ? `${loaderData.capability.name} — Capabilities — AOOS`
      : "Capability — AOOS";
    const description =
      loaderData?.capability?.description ?? "Capability detail, operations, and integration state.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData?.capability ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: CapabilityDetailPage,
});

function CapabilityDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(capabilityQuery(id));
  const capability = data.capability!;
  const operations = (capability.operations ?? []) as Operation[];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={capability.kind.replace(/_/g, " ")}
        title={capability.name}
        description={capability.description ?? "No description recorded for this capability."}
        actions={
          <StatePill label={capability.integration_state} tone={toneForState(capability.integration_state)} />
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Record</h2>
          <dl className="mt-3">
            <DetailRow label="Key" value={capability.key} />
            <DetailRow label="Category" value={capability.category ?? "Uncategorised"} />
            <DetailRow label="Auth" value={capability.auth_kind ?? "None"} />
            <DetailRow label="Health" value={<StatePill label={capability.health} tone={toneForState(capability.health)} />} />
            <DetailRow label="Last run" value={formatWhen(capability.last_run_at)} />
          </dl>
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Operations</h2>
          {operations.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No operations declared.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {operations.map((operation) => (
                <li key={operation.name} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{operation.name}</span>
                    {operation.mutates ? <StatePill label="mutating" tone="warning" /> : null}
                  </div>
                  {operation.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{operation.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {capability.key === "search.console" ? <SearchConsolePanel /> : null}
      {capability.key === "aoos.mcp" ? <McpPanel /> : null}
      {capability.key.startsWith("cap.dataforseo") ? <DataForSeoPanel /> : null}




      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Granted to agents</h2>
        {data.agents.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No agent holds this capability yet.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.agents.map((grant) =>
              grant.agents ? (
                <li key={grant.agents.id}>
                  <Link
                    to="/agents/$id"
                    params={{ id: grant.agents.id }}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    {grant.agents.name}
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </GlassCard>

      <Link to="/capabilities" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to capabilities
      </Link>
    </div>
  );
}
