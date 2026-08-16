import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  DetailRow,
  EmptyNote,
  formatWhen,
  GlassCard,
  PageHeader,
  StatePill,
  toneForState,
} from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { runReferenceAgent } from "@/lib/os-admin.functions";
import { getAgent } from "@/lib/os.functions";

const agentQuery = (id: string) => ({
  queryKey: ["agent", id],
  queryFn: () => getAgent({ data: { id } }),
});

export const Route = createFileRoute("/agents/$id")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(agentQuery(params.id));
    if (!data.agent) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.agent ? `${loaderData.agent.name} — Agents — AOOS` : "Agent — AOOS";
    const description = loaderData?.agent?.purpose ?? "Agent detail, grants, and run history.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData?.agent ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(agentQuery(id));
  const queryClient = useQueryClient();
  const run = useServerFn(runReferenceAgent);
  const agent = data.agent!;
  const permissions = (agent.permissions ?? {}) as {
    mutating?: boolean;
    requiresApproval?: boolean;
  };

  const mutation = useMutation({
    mutationFn: () => run({ data: { agentId: id } }),
    onSuccess: (result) => {
      toast.success(`${result.agent}: ${result.summary}`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Agent"
        title={agent.name}
        description={agent.purpose ?? agent.description ?? "No purpose recorded for this agent."}
        actions={
          <>
            <StatePill label={agent.health} tone={toneForState(agent.health)} />
            <Button
              variant="outline"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Running" : "Run agent"}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Configuration</h2>
          <dl className="mt-3">
            <DetailRow label="Key" value={agent.key} />
            <DetailRow label="Model" value={agent.model ?? "Not set"} />
            <DetailRow label="Memory scope" value={agent.memory_scope} />
            <DetailRow
              label="Status"
              value={<StatePill label={agent.status} tone={toneForState(agent.status)} />}
            />
            <DetailRow
              label="Approval"
              value={permissions.requiresApproval ? "Required before acting" : "Not required"}
            />
            <DetailRow label="Mutating" value={permissions.mutating ? "Yes" : "No"} />
            <DetailRow
              label="Assigned workflow"
              value={
                agent.workflows ? (
                  <Link
                    to="/workflows/$id"
                    params={{ id: agent.workflows.id }}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {agent.workflows.name}
                  </Link>
                ) : (
                  "None"
                )
              }
            />
          </dl>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Current work</h2>
            <dl className="mt-3">
              <DetailRow label="Objective" value={agent.current_objective ?? "None set"} />
              <DetailRow label="Task" value={agent.current_task ?? "Idle"} />
              <DetailRow label="Last run" value={formatWhen(agent.last_run_at)} />
            </dl>
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Granted capabilities</h2>
            {data.capabilities.length === 0 ? (
              <EmptyNote className="mt-2">No capabilities granted.</EmptyNote>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.capabilities.map((grant) =>
                  grant.capabilities ? (
                    <li
                      key={grant.capabilities.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <Link
                        to="/capabilities/$id"
                        params={{ id: grant.capabilities.id }}
                        className="truncate text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {grant.capabilities.name}
                      </Link>
                      <StatePill
                        label={grant.capabilities.integration_state}
                        tone={toneForState(grant.capabilities.integration_state)}
                      />
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Knowledge access</h2>
            {data.knowledge.length === 0 ? (
              <EmptyNote className="mt-2">
                No knowledge collections attached.
              </EmptyNote>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.knowledge.map((grant) =>
                  grant.knowledge_collections ? (
                    <li key={grant.knowledge_collections.id}>
                      <Link
                        to="/knowledge/$id"
                        params={{ id: grant.knowledge_collections.id }}
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {grant.knowledge_collections.name}
                      </Link>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Run history</h2>
        {data.activity.length === 0 ? (
          <EmptyNote className="mt-2">No recorded runs yet.</EmptyNote>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.activity.map((event) => (
              <li
                key={event.id}
                className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <StatePill label={event.verb} tone="primary" />
                  <span className="text-xs text-muted-foreground">
                    {formatWhen(event.occurred_at)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-foreground">{event.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <Link to="/agents" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to agents
      </Link>
    </div>
  );
}
