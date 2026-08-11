import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import {
  EmptyState,
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { getOverview } from "@/lib/os.functions";
import { getTenantContext } from "@/lib/tenant.functions";

export const Route = createFileRoute("/command-center")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
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
  errorComponent: OperatorRouteError,
  component: CommandCenterPage,
});


const tiles = [
  { key: "assets", label: "Assets", to: "/assets" },
  { key: "capabilities", label: "Capabilities", to: "/capabilities" },
  { key: "knowledge_entries", label: "Knowledge entries", to: "/knowledge" },
  { key: "agents", label: "Agents", to: "/agents" },
  { key: "workflows", label: "Workflows", to: "/workflows" },
  { key: "recommendations", label: "Recommendations", to: "/recommendations" },
  { key: "schedules", label: "Schedules", to: "/scheduler" },
  { key: "inbox_items", label: "Inbox items", to: "/" },
] as const;

/** Safe navigation only. Nothing here runs a workflow or spends provider credit. */
function QuickAction({
  to,
  hash,
  label,
  count,
  outcome,
}: {
  to: "/" | "/competitors" | "/ads/advertisers" | "/workflows" | "/essentials";
  hash?: string;
  label: string;
  count: number;
  outcome: string;
}) {
  return (
    <Link to={to} {...(hash ? { hash } : {})} className="block">
      <GlassCard className="h-full p-4 transition-colors hover:border-primary/40">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-lg font-semibold text-primary">{count}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{outcome}</p>
      </GlassCard>
    </Link>
  );
}


function CommandCenterPage() {
  // useServerFn routes the call through client middleware, which attaches the
  // operator bearer token. A direct call is unauthenticated on cold load.
  const loadTenantContext = useServerFn(getTenantContext);
  const loadOverview = useServerFn(getOverview);

  const tenant = useSuspenseQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadTenantContext(),
    retry: false,
  });
  const activeTenantId = tenant.data.activeTenantId;

  const { data } = useSuspenseQuery({
    queryKey: ["overview", activeTenantId],
    queryFn: () => loadOverview(),
    retry: false,
  });
  const failing = data.capabilities.filter((capability) => capability.health === "failing");
  const notLive = data.capabilities.filter((capability) => capability.integration_state !== "real");
  const failedRuns = data.runs.filter((run) => run.state === "failed").length;
  const evidence = data.evidence;
  const quick = data.quickActions;
  const usedShare = evidence.ceilingUsd > 0 ? (evidence.spentUsd / evidence.ceilingUsd) * 100 : 0;

  if (!data.ready) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="System state"
          title="Command Center"
          description="System state is readable by signed-in operators only."
        />
        <EmptyState
          title="No operator session"
          description="Sign in to read live counts, capability health, provider spend, and evidence freshness. Nothing is shown until the server can scope the read to you."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="System state"
        title="Command Center"
        description="One read on what exists, what is live, and what is drifting right now."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Quick actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            to="/"
            label="Review Inbox"
            count={quick.openInbox}
            outcome="Open items waiting on you across every workspace."
          />
          <QuickAction
            to="/competitors"
            label="Review competitor candidates"
            count={quick.pendingCompetitors}
            outcome="Approving a candidate adds the domain to tracked competitors. Nothing is published."
          />
          <QuickAction
            to="/ads/advertisers"
            label="Review Google Ads advertiser candidate"
            count={quick.pendingAdvertisers}
            outcome="Confirming links an observed advertiser account to a watched vendor domain."
          />
          <QuickAction
            to="/essentials"
            label="Open Essentials"
            count={18}
            outcome="Plain-language coverage status for every marketing essential. Navigation only."
          />
          <QuickAction
            to="/workflows"
            hash="failed-runs"
            label="Inspect failed workflow runs"
            count={quick.failedRuns}
            outcome="Read the stored error on each failure before deciding to rerun anything."
          />

        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.key} to={tile.to} className="block">
            <MetricTile label={tile.label} value={data.counts[tile.key] ?? 0} />
          </Link>
        ))}
      </div>


      <GlassCard glow className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Evidence and spend</h2>
          <StatePill
            label={`${usedShare.toFixed(2)}% of ceiling used`}
            tone={usedShare >= 75 ? "warning" : "success"}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Provider spend"
            value={`$${evidence.spentUsd.toFixed(4)}`}
            hint={`Ceiling $${evidence.ceilingUsd.toFixed(2)} this month`}
          />
          <MetricTile
            label="Provider requests"
            value={evidence.providerRequests}
            hint="Cost attributed ledger entries"
          />
          <MetricTile
            label="DataForSEO snapshots"
            value={evidence.dataforseoSnapshots}
            hint={`Last ${formatWhen(evidence.lastDataforseoAt)}`}
          />
          <MetricTile
            label="Search Console snapshots"
            value={evidence.searchConsoleSnapshots}
            hint={`Last ${formatWhen(evidence.lastSearchConsoleAt)}`}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Keyword candidates"
            value={evidence.pendingKeywordCandidates}
            hint="Awaiting operator approval"
          />
          <MetricTile label="Tracked keywords" value={evidence.trackedKeywords} hint="Approved and active" />
          <MetricTile
            label="Competitor candidates"
            value={evidence.competitorCandidates}
            hint="Derived from observed SERPs"
          />
          <MetricTile label="Tracked competitors" value={evidence.trackedCompetitors} hint="Approved and active" />
        </div>
        {data.pendingApprovals > 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {data.pendingApprovals} decisions are waiting on you.{" "}
            <Link to="/" className="text-primary underline-offset-4 hover:underline">
              Open the Inbox
            </Link>
            .
          </p>
        ) : null}
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
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
                <Link
                  to="/capabilities/$id"
                  params={{ id: capability.id }}
                  className="truncate text-sm text-foreground underline-offset-4 hover:text-primary hover:underline"
                >
                  {capability.name}
                </Link>
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
            <h2 className="text-sm font-semibold text-foreground">Recent runs</h2>
            {data.runs.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No workflow runs recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.runs.slice(0, 8).map((run) => {
                  const label = run.workflows?.name ?? run.workflows?.key ?? "Workflow";
                  const workflowId = run.workflows?.id ?? run.workflow_id;
                  return (
                    <li
                      key={run.id}
                      className="space-y-1 border-b border-border/50 pb-2 text-sm last:border-b-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {workflowId ? (
                          <Link
                            to="/workflows/$id"
                            params={{ id: workflowId }}
                            className="truncate text-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            {label}
                          </Link>
                        ) : (
                          <span className="truncate text-foreground">{label}</span>
                        )}
                        <span className="flex items-center gap-3">
                          <StatePill label={run.state} tone={toneForState(run.state)} />
                          <span className="text-xs text-muted-foreground">{run.trigger_source}</span>
                          <span className="text-xs text-muted-foreground">{formatWhen(run.created_at)}</span>
                        </span>
                      </div>
                      {run.state === "failed" ? (
                        <p className="text-xs text-destructive">
                          {run.error ?? "The run failed without recording an error message."}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/workflows"
              className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline"
            >
              Open the workflow registry
            </Link>
          </GlassCard>

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
