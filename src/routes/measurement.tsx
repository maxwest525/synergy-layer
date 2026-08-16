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
import { describeMissingSnapshot } from "@/lib/measurement/pagespeed";
import { Button } from "@/components/ui/button";
import {
  getMeasurementState,
  refreshGa4,
  runPageSpeedCheck,
  type MeasurementRunView,
  type PageSpeedSnapshotView,
} from "@/lib/measurement.functions";

export const Route = createFileRoute("/measurement")({
  // Operator surface: nothing here is public and the server read needs the
  // operator bearer token, so it renders client side like the other workspaces.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Measurement — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "Run a real PageSpeed Insights check on an owned page, read the stored Lighthouse evidence and history, and see the honest GA4 connection state.",
      },
      {
        property: "og:title",
        content: "Measurement — AOOS Marketing Operating System",
      },
      {
        property: "og:description",
        content:
          "Page speed and technical SEO evidence, plus the truthful analytics connection state.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: MeasurementPage,
});

function ms(value: number | null): string {
  if (value === null) return "not returned";
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

function score(value: number | null): string {
  return value === null ? "not returned" : String(value);
}

function scoreTone(value: number | null): "success" | "warning" | "danger" | "neutral" {
  if (value === null) return "neutral";
  if (value >= 90) return "success";
  if (value >= 50) return "warning";
  return "danger";
}

type Ga4UiRow = {
  hostName: string;
  pagePath: string;
  eventName: string;
  eventCount: number;
  activeUsers: number;
  sessions: number;
};

function ga4Number(metrics: Record<string, unknown>, key: string): number {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function ga4Rows(metrics: Record<string, unknown>): Ga4UiRow[] {
  if (!Array.isArray(metrics["rows"])) return [];
  return metrics["rows"].filter(
    (row): row is Ga4UiRow =>
      Boolean(row) &&
      typeof row === "object" &&
      typeof (row as Ga4UiRow).hostName === "string" &&
      typeof (row as Ga4UiRow).pagePath === "string" &&
      typeof (row as Ga4UiRow).eventName === "string" &&
      typeof (row as Ga4UiRow).eventCount === "number" &&
      typeof (row as Ga4UiRow).activeUsers === "number" &&
      typeof (row as Ga4UiRow).sessions === "number",
  );
}

function RunRow({ run }: { run: MeasurementRunView }) {
  return (
    <li className="space-y-1 border-b border-border/50 pb-2 text-sm last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="truncate text-foreground">
          {run.target}
          {run.strategy ? ` · ${run.strategy}` : ""}
        </span>
        <span className="flex items-center gap-3">
          <StatePill label={run.status} tone={toneForState(run.status)} />
          <span className="text-xs text-muted-foreground">{formatWhen(run.startedAt)}</span>
          {run.durationMs !== null ? (
            <span className="text-xs text-muted-foreground">{Math.round(run.durationMs)} ms</span>
          ) : null}
        </span>
      </div>
      {run.error ? (
        <p
          className={
            run.status === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {run.error}
          {run.httpStatus !== null ? ` (HTTP ${run.httpStatus})` : ""}
        </p>
      ) : null}
    </li>
  );
}

function SnapshotCard({ snapshot }: { snapshot: PageSpeedSnapshotView }) {
  return (
    <GlassCard glow className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Latest Lighthouse evidence</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {snapshot.finalUrl ?? snapshot.url} · {snapshot.strategy} · collected{" "}
            {formatWhen(snapshot.collectedAt)}
            {snapshot.lighthouseVersion ? ` · Lighthouse ${snapshot.lighthouseVersion}` : ""}
          </p>
        </div>
        <StatePill label="Evidence, not a decision" tone="primary" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Performance score"
          value={score(snapshot.performanceScore)}
          hint="Lighthouse lab run"
        />
        <MetricTile
          label="SEO score"
          value={score(snapshot.seoScore)}
          hint="Lighthouse technical SEO audits"
        />
        <MetricTile label="LCP" value={ms(snapshot.lcpMs)} hint="Largest contentful paint" />
        <MetricTile
          label="CLS"
          value={snapshot.cls === null ? "not returned" : snapshot.cls.toFixed(3)}
          hint="Cumulative layout shift"
        />
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="TBT" value={ms(snapshot.tbtMs)} hint="Total blocking time" />
        <MetricTile label="FCP" value={ms(snapshot.fcpMs)} hint="First contentful paint" />
        <MetricTile
          label="Speed Index"
          value={ms(snapshot.speedIndexMs)}
          hint="Visual load progression"
        />
        <MetricTile
          label="Opportunities"
          value={snapshot.opportunities.length}
          hint="With an estimated saving"
        />
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-foreground">Returned opportunities</h3>
        {snapshot.opportunities.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            This run returned no opportunity with an estimated saving.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {snapshot.opportunities.map((row) => (
              <li key={row.id} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm text-foreground">{row.title}</span>
                  <span className="text-xs text-primary">
                    {row.savingsMs !== null ? `${Math.round(row.savingsMs)} ms est. saving` : null}
                    {row.savingsMs !== null && row.savingsBytes !== null ? " · " : null}
                    {row.savingsBytes !== null
                      ? `${Math.round(row.savingsBytes / 1024)} KiB`
                      : null}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {row.description}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Source: PageSpeed Insights v5 audit{" "}
                  <span className="text-foreground">{row.id}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-5 rounded-xl border border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        These are measurements, not proposals. Nothing here asks you to approve a score. Turning any
        finding into a site edit requires a separate proposed change with an exact target, before
        and after, execution method, risk, and tracking.
      </p>
    </GlassCard>
  );
}

function MeasurementPage() {
  const loadState = useServerFn(getMeasurementState);
  const runCheck = useServerFn(runPageSpeedCheck);
  const refreshAnalytics = useServerFn(refreshGa4);
  const queryClient = useQueryClient();

  const { data } = useSuspenseQuery({
    queryKey: ["measurement"],
    queryFn: () => loadState(),
    retry: false,
  });

  const [url, setUrl] = useState(data.defaultUrl);
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");

  const mutation = useMutation({
    mutationFn: (input: { url: string; strategy: "mobile" | "desktop" }) =>
      runCheck({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.status === "partial"
          ? `PageSpeed run stored with gaps: ${result.missing.join(", ")}`
          : `PageSpeed run stored. Performance ${result.performanceScore ?? "n/a"}, SEO ${result.seoScore ?? "n/a"}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["measurement"] });
    },
    onError: (error: Error) => toast.error(error.message),
    // A failed attempt is still history, so the stored run list refreshes either way.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["measurement"] });
    },
  });

  const ga4Mutation = useMutation({
    mutationFn: () => refreshAnalytics(),
    onSuccess: (result) => {
      toast.success(
        `GA4 refresh stored ${result.rowCount} page/event row(s) across ${result.pageCount} page(s).`,
      );
      void queryClient.invalidateQueries({ queryKey: ["measurement"] });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["measurement"] });
    },
  });

  const latest = data.snapshots[0] ?? null;
  const ga4 = data.ga4;
  const latestGa4Metrics = ga4.latest?.metrics ?? {};
  const latestGa4Rows = ga4Rows(latestGa4Metrics);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Measurement"
        title="Page speed and analytics"
        description="Run one real PageSpeed check on an owned page and read what the provider actually returned. Analytics stays honest about whether it is connected."
      />

      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Run PageSpeed</h2>
          <span className="flex items-center gap-2">
            <StatePill label="Provider cost $0" tone="success" />
            <StatePill label="Google quota limited" tone="warning" />
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          One click makes exactly one request to the official PageSpeed Insights v5 endpoint. There
          is no automatic rerun, no schedule, and no background job.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            Owned page URL
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              placeholder="https://trumoveinc.com"
            />
          </label>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            Strategy
            <div className="flex gap-2">
              {(["mobile", "desktop"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={strategy === option}
                  className={strategy === option ? "border-primary/60 text-primary" : ""}
                  onClick={() => setStrategy(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!data.isOperator || mutation.isPending}
            onClick={() => mutation.mutate({ url, strategy })}
          >
            {mutation.isPending ? "Running one check" : "Run PageSpeed"}
          </Button>
        </div>

        {!data.isOperator ? (
          <p className="mt-3 text-sm text-muted-foreground">
            You can read stored measurements. Running a check requires an operator role.
          </p>
        ) : null}
        {data.ownedUrls.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Owned targets: {data.ownedUrls.join(", ")}. A URL outside these hosts is refused.
          </p>
        ) : null}
      </GlassCard>

      {latest ? (
        <SnapshotCard snapshot={latest} />
      ) : (
        <EmptyState
          title={describeMissingSnapshot(data.runs).title}
          description={describeMissingSnapshot(data.runs).description}
        />
      )}

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Run history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every attempt is recorded, including failures and partial responses.
        </p>
        {data.runs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No PageSpeed run has been attempted yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Google Analytics 4</h2>
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
            <StatePill label="Quota limited" tone="warning" />
          </span>
        </div>

        <div className="mt-4 space-y-1">
          <DetailRow
            label="Tenant GA4 property"
            value={ga4.property ?? "not bound to the selected Search Console property"}
          />
          <DetailRow label="Reporting window" value="28 days through yesterday, once connected" />
          <DetailRow
            label="Last successful refresh"
            value={ga4.latest ? formatWhen(ga4.latest.collectedAt) : "never"}
          />
        </div>

        <p className="mt-4 text-sm text-muted-foreground">{ga4.connection.statement}</p>

        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={!data.isOperator || !ga4.connection.configured || ga4Mutation.isPending}
          onClick={() => ga4Mutation.mutate()}
        >
          {ga4Mutation.isPending ? "Refreshing GA4" : "Refresh GA4"}
        </Button>

        {ga4.connection.configured ? null : (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-3">
            <p className="text-sm font-medium text-foreground">
              What must be enabled before a first request
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {ga4.connection.requirements.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              No local credential is copied in, and no historical figures are shown. Configuration,
              authentication, and a successful property read are reported separately.
            </p>
          </div>
        )}

        {ga4.connection.configured && !ga4.connection.authenticated ? (
          <p className="mt-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-3 text-sm text-muted-foreground">
            One-time Google step: enable the Google Analytics Data API and grant the service account
            client_email from GA4_SERVICE_ACCOUNT_JSON Viewer access to{" "}
            {ga4.property ?? "the tenant-bound GA4 property"}. For OAuth mode, reconnect the Google
            user and ensure that user has Viewer access to the same property. Then select Refresh
            GA4.
          </p>
        ) : null}

        {ga4.latest ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile
                label="Returned rows"
                value={ga4Number(latestGa4Metrics, "rowCount")}
                hint="Exact page and event combinations"
              />
              <MetricTile
                label="Returned pages"
                value={ga4Number(latestGa4Metrics, "pageCount")}
                hint="Hostname plus path and query"
              />
              <MetricTile
                label="Event names"
                value={ga4Number(latestGa4Metrics, "eventNameCount")}
                hint="Observed in the reporting window"
              />
              <MetricTile
                label="Events"
                value={ga4Number(latestGa4Metrics, "totalEventCount")}
                hint="Provider total, not a success judgment"
              />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Exact page and event inventory
              </h3>
              {latestGa4Rows.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  GA4 returned a valid empty inventory for this window.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {latestGa4Rows.slice(0, 50).map((row, index) => (
                    <li
                      key={`${row.hostName}${row.pagePath}:${row.eventName}:${index}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 text-sm last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 break-all text-foreground">
                        {row.hostName}
                        {row.pagePath} · {row.eventName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.eventCount} event(s) · {row.activeUsers} active user(s) ·{" "}
                        {row.sessions} session(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {latestGa4Rows.length > 50 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing the first 50 of {latestGa4Rows.length} returned rows.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {ga4.runs.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {ga4.runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        ) : null}

        <Link
          to="/capabilities/systems/$key"
          params={{ key: "api.ga4_data" }}
          className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          Open the GA4 Data API system record
        </Link>
      </GlassCard>
    </div>
  );
}
