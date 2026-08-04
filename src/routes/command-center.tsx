import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import {
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { getOverview } from "@/lib/os.functions";

const overviewQuery = { queryKey: ["overview"], queryFn: () => getOverview() };

export const Route = createFileRoute("/command-center")({
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQuery),
  head: () => ({
    meta: [
      { title: "Command Center — AOOS" },
      {
        name: "description",
        content: "Live system state across assets, capabilities, agents, workflows, and schedules.",
      },
      { property: "og:title", content: "Command Center — AOOS" },
      { property: "og:description", content: "Live system state for the marketing operating system." },
    ],
  }),
  component: CommandCenterPage,
});

const tiles = [
  { key: "assets", label: "Assets" },
  { key: "capabilities", label: "Capabilities" },
  { key: "knowledge_entries", label: "Knowledge entries" },
  { key: "agents", label: "Agents" },
  { key: "workflows", label: "Workflows" },
  { key: "recommendations", label: "Recommendations" },
  { key: "schedules", label: "Schedules" },
  { key: "inbox_items", label: "Inbox items" },
] as const;

function CommandCenterPage() {
  const { data } = useSuspenseQuery(overviewQuery);
  const failing = data.capabilities.filter((capability) => capability.health === "failing");
  const notLive = data.capabilities.filter((capability) => capability.integration_state !== "real");
  const failedRuns = data.runs.filter((run) => run.state === "failed").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="System state"
        title="Command Center"
        description="One read on what exists, what is live, and what is drifting right now."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <MetricTile key={tile.key} label={tile.label} value={data.counts[tile.key] ?? 0} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard glow className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Integration truth</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {notLive.length} of {data.capabilities.length} capabilities are not live yet. Nothing is
            presented as connected until it is.
          </p>
          <ul className="mt-4 space-y-2">
            {data.capabilities.map((capability) => (
              <li
                key={capability.key}
                className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-b-0"
              >
                <span className="truncate text-sm text-foreground">{capability.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatePill
                    label={capability.integration_state}
                    tone={toneForState(capability.integration_state)}
                  />
                  <StatePill label={capability.health} tone={toneForState(capability.health)} />
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricTile label="Failed runs" value={failedRuns} hint="Last 50 workflow runs" />
            <MetricTile label="Failing capabilities" value={failing.length} hint="Health check state" />
          </div>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
            <ul className="mt-3 space-y-3">
              {data.activity.map((event) => (
                <li key={event.id} className="space-y-1 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <StatePill label={event.verb} tone="primary" />
                    <span className="text-xs text-muted-foreground">{formatWhen(event.occurred_at)}</span>
                  </div>
                  <p className="text-sm text-foreground">{event.summary}</p>
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
