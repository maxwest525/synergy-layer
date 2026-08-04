import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { EmptyState, GlassCard, PageHeader, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { syncRegistry } from "@/lib/os-admin.functions";
import { getCapabilities } from "@/lib/os.functions";

const capabilitiesQuery = { queryKey: ["capabilities"], queryFn: () => getCapabilities() };

export const Route = createFileRoute("/capabilities/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(capabilitiesQuery),
  head: () => ({
    meta: [
      { title: "Capability Registry — AOOS" },
      {
        name: "description",
        content:
          "Every MCP, API, connector, skill, model, repository, and internal module the operating system can call, with its true integration state.",
      },
      { property: "og:title", content: "Capability Registry — AOOS" },
      { property: "og:description", content: "What the operating system can actually do, and what is only declared." },
    ],
  }),
  component: CapabilitiesPage,
});

function CapabilitiesPage() {
  const { data } = useSuspenseQuery(capabilitiesQuery);
  const queryClient = useQueryClient();
  const sync = useServerFn(syncRegistry);

  const mutation = useMutation({
    mutationFn: () => sync({ data: undefined }),
    onSuccess: (result) => {
      toast.success(`Synced ${result.capabilities} capabilities from ${result.modules} modules`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const kinds = Array.from(new Set(data.map((capability) => capability.kind)));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="What the OS can do"
        title="Capability Registry"
        description="MCPs, APIs, connectors, skills, models, repositories, and internal modules. Integration state is never assumed."
        actions={
          <Button variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Syncing" : "Sync from modules"}
          </Button>
        }
      />

      {data.length === 0 ? (
        <EmptyState title="No capabilities registered" description="Add a module definition, then sync the registry." />
      ) : (
        kinds.map((kind) => (
          <section key={kind} className="space-y-3">
            <h2 className="text-sm font-semibold capitalize tracking-tight text-foreground">
              {kind.replace(/_/g, " ")}
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {data
                .filter((capability) => capability.kind === kind)
                .map((capability) => (
                  <Link
                    key={capability.id}
                    to="/capabilities/$id"
                    params={{ id: capability.id }}
                    className="block"
                  >
                    <GlassCard className="h-full p-4 transition-colors hover:border-primary/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{capability.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{capability.key}</p>
                        </div>
                        <StatePill
                          label={capability.integration_state}
                          tone={toneForState(capability.integration_state)}
                        />
                      </div>
                      {capability.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{capability.description}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <StatePill label={capability.health} tone={toneForState(capability.health)} />
                        {capability.auth_kind ? <StatePill label={capability.auth_kind} /> : null}
                        <span className="text-xs text-muted-foreground">
                          Last run {formatWhen(capability.last_run_at)}
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
