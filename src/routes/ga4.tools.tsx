import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  DetailRow,
  EmptyState,
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import { getGa4Findings } from "@/lib/ga4-findings.functions";
import { getMeasurementState, refreshGa4, type Ga4MetricValue } from "@/lib/measurement.functions";
import { getTenantContext } from "@/lib/tenant.functions";

export const Route = createFileRoute("/ga4/tools")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Analytics tools — Marky" },
      {
        name: "description",
        content:
          "Connection state, run diagnostics, and stored GA4 snapshots for the tenant's bound Analytics property.",
      },
      {
        property: "og:title",
        content: "Google Analytics 4 — Marky",
      },
      {
        property: "og:description",
        content: "Truthful GA4 connection state and the immutable snapshots AOOS has stored.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: Ga4Page,
});

function ms(value: number | null): string {
  if (value === null) return "not recorded";
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

function metricNumber(metrics: Record<string, Ga4MetricValue>, key: string): number {
  const value = metrics[key];
  return typeof value === "number" ? value : 0;
}

const RULE_LABEL: Record<string, string> = {
  page_traffic_loss: "Traffic loss",
  page_traffic_gain: "Traffic gain",
  event_disappeared: "Event stopped",
  zero_engagement_page: "No engagement",
};

const OPEN_FINDING_STATES = new Set(["draft", "proposed", "under_review", "observed", "scheduled"]);

function Ga4Page() {
  const loadState = useServerFn(getMeasurementState);
  const loadTenantContext = useServerFn(getTenantContext);
  const loadFindings = useServerFn(getGa4Findings);
  const refreshAnalytics = useServerFn(refreshGa4);
  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery({
    queryKey: ["measurement"],
    queryFn: () => loadState(),
    retry: false,
  });

  // Tenant scoped key: a workspace switch can never serve the previous
  // client's GA4 findings from cache.
  const tenant = useSuspenseQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadTenantContext(),
    retry: false,
  });
  const activeTenantId = tenant.data.activeTenantId;
  const findings = useSuspenseQuery({
    queryKey: ["ga4-findings", activeTenantId],
    queryFn: () => loadFindings(),
    retry: false,
  });
  const [findingFilter, setFindingFilter] = useState<string>("all");

  const ga4 = data.ga4;
  const diagnostics = ga4.diagnostics;
  const latestMetrics = ga4.latest?.metrics ?? {};

  const refresh = useMutation({
    mutationFn: () => refreshAnalytics(),
    onSuccess: (result) =>
      toast.success(
        `GA4 read stored ${result.rowCount} row(s) across ${result.pageCount} page(s).`,
      ),
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["measurement"] });
    },
  });

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Evidence"
        title="Google Analytics 4"
        description="Connection state, query diagnostics, and every stored snapshot for the Analytics property bound to this tenant. Nothing here is estimated: each row came back from a real Data API response."
      />

      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Connection</h2>
          <span className="flex items-center gap-2">
            <StatePill
              label={ga4.connection.configured ? "Configured" : "Not configured"}
              tone={ga4.connection.configured ? "success" : "warning"}
            />
            <StatePill
              label={ga4.connection.authenticated ? "Authenticated" : "Auth not proven"}
              tone={ga4.connection.authenticated ? "success" : "warning"}
            />
            <StatePill
              label={ga4.connection.connected ? "Read succeeded" : "Read not proven"}
              tone={ga4.connection.connected ? "success" : "warning"}
            />
            <StatePill label="Provider cost $0" tone="success" />
          </span>
        </div>

        <div className="mt-4 space-y-1">
          <DetailRow label="Property" value={ga4.property ?? "not bound to this tenant"} />
          <DetailRow label="Data API endpoint" value={diagnostics.endpoint} />
          <DetailRow label="Reporting window" value="28 days through yesterday" />
          <DetailRow
            label="Last successful run"
            value={
              diagnostics.lastSuccessAt
                ? `${formatWhen(diagnostics.lastSuccessAt)} · ${
                    diagnostics.lastSuccessRowCount ?? 0
                  } row(s) · ${ms(diagnostics.lastSuccessDurationMs)}`
                : "no successful run stored"
            }
          />
          <DetailRow
            label="Last error"
            value={
              diagnostics.lastError
                ? `${formatWhen(diagnostics.lastErrorAt ?? "")} · HTTP ${
                    diagnostics.lastErrorHttpStatus ?? "none"
                  } · ${diagnostics.lastError}`
                : "none recorded"
            }
          />
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{ga4.connection.statement}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!data.isOperator || !ga4.connection.configured || refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? "Reading GA4" : "Refresh GA4"}
          </Button>
          <Link
            to="/measurement"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Back to Site health
          </Link>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Automatic daily read</h2>
        {diagnostics.schedule ? (
          <div className="mt-4 space-y-1">
            <DetailRow
              label="Status"
              value={diagnostics.schedule.enabled ? "Enabled" : "Disabled"}
            />
            <DetailRow label="Cron" value={`${diagnostics.schedule.cron} (UTC)`} />
            <DetailRow
              label="Last run"
              value={
                diagnostics.schedule.lastRunAt
                  ? `${formatWhen(diagnostics.schedule.lastRunAt)} · ${
                      diagnostics.schedule.lastState ?? "unknown"
                    } · ${ms(diagnostics.schedule.lastDurationMs)}`
                  : "never run"
              }
            />
            <DetailRow
              label="Next run"
              value={
                diagnostics.schedule.nextRunAt
                  ? formatWhen(diagnostics.schedule.nextRunAt)
                  : "unscheduled"
              }
            />
            <DetailRow
              label="Consecutive failures"
              value={String(diagnostics.schedule.failureCount)}
            />
          </div>
        ) : (
          <EmptyState
            title="No schedule registered"
            description="The daily GA4 observation schedule is not present in this environment yet."
          />
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Latest snapshot</h2>
        {ga4.latest ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {ga4.latest.startDate} to {ga4.latest.endDate}, collected{" "}
              {formatWhen(ga4.latest.collectedAt)}.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile
                label="Returned rows"
                value={metricNumber(latestMetrics, "rowCount")}
                hint="Page and event combinations"
              />
              <MetricTile
                label="Returned pages"
                value={metricNumber(latestMetrics, "pageCount")}
                hint="Hostname plus path and query"
              />
              <MetricTile
                label="Sessions"
                value={metricNumber(latestMetrics, "totalSessions")}
                hint="Provider total for the window"
              />
              <MetricTile
                label="Events"
                value={metricNumber(latestMetrics, "totalEventCount")}
                hint="Provider total for the window"
              />
            </div>
          </>
        ) : (
          <EmptyState
            title="No snapshot stored"
            description="GA4 counts as connected only after a real read stores a snapshot. Select Refresh GA4 above, or wait for the daily run."
          />
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Rule findings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What the nightly rules concluded from the stored snapshots: pages and events that need
          attention, each linked to its card in the Recommendation Queue.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <MetricTile
            label="Open findings"
            value={String(
              findings.data.findings.filter(
                (finding) =>
                  finding.recommendationState === null ||
                  OPEN_FINDING_STATES.has(finding.recommendationState),
              ).length,
            )}
            hint="Awaiting a decision"
          />
          <MetricTile
            label="Stored findings"
            value={String(findings.data.findings.length)}
            hint="Most recent 200"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-pressed={findingFilter === "all"}
            className={findingFilter === "all" ? "border-primary/60 text-primary" : undefined}
            onClick={() => setFindingFilter("all")}
          >
            All ({findings.data.findings.length})
          </Button>
          {Object.entries(findings.data.countsByRule).map(([rule, count]) => (
            <Button
              key={rule}
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={findingFilter === rule}
              className={findingFilter === rule ? "border-primary/60 text-primary" : undefined}
              onClick={() => setFindingFilter(rule)}
            >
              {RULE_LABEL[rule] ?? rule} ({count})
            </Button>
          ))}
        </div>

        {findings.data.findings.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No findings stored yet. They appear after the nightly observation runs over collected
            evidence.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {findings.data.findings
              .filter((finding) => findingFilter === "all" || finding.rule === findingFilter)
              .slice(0, 30)
              .map((finding) => (
                <li
                  key={finding.id}
                  className="rounded-lg border border-border/60 bg-background/30 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {finding.recommendationTitle ?? finding.target}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {RULE_LABEL[finding.rule] ?? finding.rule} · observed {finding.periodEnd}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {finding.recommendationState ? (
                        <StatePill
                          label={finding.recommendationState.replace(/_/g, " ")}
                          tone={
                            OPEN_FINDING_STATES.has(finding.recommendationState)
                              ? "warning"
                              : "neutral"
                          }
                        />
                      ) : null}
                      {finding.recommendationId ? (
                        <Button asChild size="sm" variant="outline">
                          <Link to="/recommendations/$id" params={{ id: finding.recommendationId }}>
                            Review
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Stored snapshots</h2>
        {ga4.snapshots.length === 0 ? (
          <EmptyState
            title="Nothing stored yet"
            description="Each successful read appends one immutable snapshot here."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {ga4.snapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 text-sm last:border-b-0"
              >
                <span className="text-foreground">
                  {snapshot.startDate} to {snapshot.endDate}
                </span>
                <span className="text-xs text-muted-foreground">
                  {metricNumber(snapshot.metrics, "rowCount")} row(s) ·{" "}
                  {metricNumber(snapshot.metrics, "totalSessions")} session(s) ·{" "}
                  {formatWhen(snapshot.collectedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Run history</h2>
        {ga4.runs.length === 0 ? (
          <EmptyState
            title="No runs recorded"
            description="Every attempt, successful or failed, is recorded with its status and duration."
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {ga4.runs.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 text-sm last:border-b-0"
              >
                <span className="min-w-0 flex-1 break-all text-foreground">
                  {run.strategy ?? "run"} · {run.target}
                  {run.error ? (
                    <span className="block text-xs text-muted-foreground">{run.error}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatePill label={run.status} tone={toneForState(run.status)} />
                  {ms(run.durationMs)} · {formatWhen(run.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
