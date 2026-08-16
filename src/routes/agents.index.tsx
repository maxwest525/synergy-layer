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
import { getAgents } from "@/lib/os.functions";

const agentsQuery = { queryKey: ["agents"], queryFn: () => getAgents() };

export const Route = createFileRoute("/agents/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: ({ context }) => {
    // Warm the cache without blocking navigation; the suspense boundary
    // renders the pending surface immediately.
    void context.queryClient.prefetchQuery(agentsQuery);
  },
  head: () => ({
    meta: [
      { title: "Agent Registry — AOOS" },
      {
        name: "description",
        content:
          "Every agent with its purpose, model, memory scope, granted capabilities, current objective, and last result.",
      },
      { property: "og:title", content: "Agent Registry — AOOS" },
      {
        property: "og:description",
        content: "Who does the work inside the marketing operating system.",
      },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const { data } = useSuspenseQuery(agentsQuery);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Who does the work"
        title="Agent Registry"
        description="Purpose, model, memory scope, granted capabilities, current objective, and last result for every agent."
      />

      {data.length === 0 ? (
        <EmptyState
          title="No agents registered"
          description="Declare an agent in a module, then sync the registry."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((agent) => (
            <Link key={agent.id} to="/agents/$id" params={{ id: agent.id }} className="block">
              <GlassCard className="h-full p-5 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{agent.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{agent.key}</p>
                  </div>
                  <StatePill label={agent.health} tone={toneForState(agent.health)} />
                </div>
                {agent.purpose ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{agent.purpose}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatePill label={agent.status} tone={toneForState(agent.status)} />
                  {agent.model ? <StatePill label={agent.model} tone="primary" /> : null}
                  <StatePill label={`memory: ${agent.memory_scope}`} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {agent.current_task ? `Now: ${agent.current_task}` : "Idle"} · last run{" "}
                  {formatWhen(agent.last_run_at)}
                </p>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
