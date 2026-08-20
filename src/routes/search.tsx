import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { PageAuditCallout } from "@/components/os/page-audit-callout";
import { OperatorRouteError } from "@/components/os/route-error";
import {
  EmptyState,
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
  formatWhen,
} from "@/components/os/primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchRow } from "@/lib/search.functions";
import { getSearchWorkspace } from "@/lib/search.functions";
import { getSearchFindings, proposeFixFromFinding } from "@/lib/search-findings.functions";
import {
  inspectSearchConsoleUrl,
  runSearchConsoleObservation,
  submitSearchConsoleSitemap,
} from "@/lib/search-console.functions";
import { getTenantContext } from "@/lib/tenant.functions";

export const Route = createFileRoute("/search")({
  // Operator-only workspace: rendering it server side without the operator
  // bearer token produces an empty tree the client immediately replaces.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Search workspace — Marky" },
      {
        name: "description",
        content:
          "What Google Search Console actually observed for the selected property: finalized daily clicks, impressions, CTR, average position, pages, queries, devices, countries, and sitemap status.",
      },
      { property: "og:title", content: "Search workspace — Marky" },
      {
        property: "og:description",
        content: "Stored Search Console evidence, shown exactly as Google reported it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: SearchWorkspacePage,
});

function fmtInt(value: number): string {
  return Math.round(value).toLocaleString();
}

function fmtCtr(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function fmtPosition(value: number | null): string {
  return value === null || value === 0 ? "—" : value.toFixed(1);
}

function fmtDate(value: string | null): string {
  return value ?? "—";
}

function trimUrl(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "") || value;
}

function defaultOwnedUrl(property: string | null): string {
  if (!property) return "";
  return property.toLowerCase().startsWith("sc-domain:")
    ? `https://${property.slice("sc-domain:".length)}/`
    : property;
}

function signed(value: number, suffix = ""): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function percentChange(value: number | null): string {
  return value === null ? "No prior-volume baseline" : signed(value, "%");
}

function RowTable({
  rows,
  label,
  emptyTitle,
}: {
  rows: SearchRow[];
  label: string;
  emptyTitle: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description="Google returned no rows for this dimension on the latest finalized date."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem] text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-medium">
              {label}
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Clicks
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Impressions
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              CTR
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Avg position
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.keys.join(" | ")} className="border-b border-border/40 last:border-b-0">
              <td className="py-2 pr-4 text-foreground">
                {row.keys.length > 1 ? (
                  <span className="flex flex-col">
                    <span>{trimUrl(row.keys[0] ?? "")}</span>
                    <span className="text-xs text-muted-foreground">{row.keys[1]}</span>
                  </span>
                ) : (
                  trimUrl(row.keys[0] ?? "Unknown")
                )}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                {fmtInt(row.clicks)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                {fmtInt(row.impressions)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                {fmtCtr(row.ctr)}
              </td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {fmtPosition(row.position)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionCard({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-5">
      <h2 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </GlassCard>
  );
}

const RULE_LABEL: Record<string, string> = {
  striking_distance_query: "Striking distance",
  weak_ctr_page: "Weak click-through",
  position_loss: "Position loss",
  visibility_gain: "Visibility gain",
  possible_query_overlap: "Query overlap",
  zero_impression_page: "Zero impressions",
  query_coverage_gap: "Coverage gap",
  index_coverage_drift: "Index drift",
};

const OPEN_FINDING_STATES = new Set(["draft", "proposed", "under_review", "observed", "scheduled"]);

/** Rules whose fix is a wording change the title/H1 proposal lane can draft. */
const DRAFTABLE_RULES = new Set([
  "weak_ctr_page",
  "striking_distance_query",
  "position_loss",
  "query_coverage_gap",
  "possible_query_overlap",
]);

function SearchWorkspacePage() {
  // Both reads are protected server functions, so they go through useServerFn
  // and the client middleware that attaches the operator bearer token.
  const loadTenantContext = useServerFn(getTenantContext);
  const loadWorkspace = useServerFn(getSearchWorkspace);
  const loadFindings = useServerFn(getSearchFindings);
  const draftFix = useServerFn(proposeFixFromFinding);
  const navigate = useNavigate();
  const collectEvidence = useServerFn(runSearchConsoleObservation);
  const inspectUrl = useServerFn(inspectSearchConsoleUrl);
  const submitSitemap = useServerFn(submitSearchConsoleSitemap);
  const queryClient = useQueryClient();

  // Reuses the tenant context the shell already caches under ["tenant-context"].
  const tenant = useSuspenseQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadTenantContext(),
    retry: false,
  });
  const activeTenantId = tenant.data.activeTenantId;

  // Tenant scoped key: a workspace switch can never serve the previous
  // client's Search Console evidence from cache.
  const { data } = useSuspenseQuery({
    queryKey: ["search-workspace", activeTenantId],
    queryFn: () => loadWorkspace(),
    retry: false,
  });
  const findings = useSuspenseQuery({
    queryKey: ["search-findings", activeTenantId],
    queryFn: () => loadFindings(),
    retry: false,
  });
  const [findingFilter, setFindingFilter] = useState<string>("all");

  const latest = data.dailyTotals[0];
  const ownedRoot = defaultOwnedUrl(data.property?.siteUrl ?? null);
  const [inspectionUrl, setInspectionUrl] = useState(ownedRoot);
  const [sitemapUrl, setSitemapUrl] = useState(
    data.sitemaps[0]?.path ?? `${ownedRoot.replace(/\/$/, "")}/sitemap.xml`,
  );
  const [pendingSitemap, setPendingSitemap] = useState<string | null>(null);

  const refreshWorkspace = () => {
    void queryClient.invalidateQueries({ queryKey: ["search-workspace", activeTenantId] });
    void queryClient.invalidateQueries({ queryKey: ["search-findings", activeTenantId] });
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["change-request"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const collectionMutation = useMutation({
    mutationFn: async () => {
      const result = await collectEvidence();
      if (!result.ok) throw new Error(result.error ?? "Search Console collection failed.");
      return result;
    },
    onSuccess: (result) => {
      toast.success(
        result.reportingDate
          ? `GSC evidence refreshed through ${result.reportingDate}.`
          : "GSC returned no finalized date; no evidence was invented.",
      );
      refreshWorkspace();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const inspectionMutation = useMutation({
    mutationFn: (url: string) => inspectUrl({ data: { url } }),
    onSuccess: (result) => {
      toast.success(`URL Inspection stored: ${result.inspection.verdict}.`);
      refreshWorkspace();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sitemapMutation = useMutation({
    mutationFn: (url: string) => submitSitemap({ data: { sitemapUrl: url } }),
    onSuccess: () => {
      toast.success("Sitemap submitted to Google. This does not guarantee indexing.");
      refreshWorkspace();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => {
      setPendingSitemap(null);
      refreshWorkspace();
    },
  });

  const draftMutation = useMutation({
    mutationFn: (recommendationId: string) =>
      draftFix({ data: { recommendationId, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: (result) => {
      toast.success("Draft proposal created. Review and approve it on the change page.");
      void navigate({ to: "/changes/$id", params: { id: result.changeRequest.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy =
    collectionMutation.isPending || inspectionMutation.isPending || sitemapMutation.isPending;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Evidence"
        title="Search results"
        description="What Google reports about your site: clicks, impressions, and positions for the connected property. Nothing here is modelled, scored, or projected."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !data.property}
              onClick={() => collectionMutation.mutate()}
            >
              {collectionMutation.isPending ? "Collecting…" : "Collect latest GSC data"}
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/capabilities">Capabilities</Link>
            </Button>
          </div>
        }
      />

      {!data.property ? (
        <EmptyState
          title="No Search Console property selected"
          description="Select a property on the website asset before this workspace can show anything."
        />
      ) : (
        <>
          <GlassCard className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Selected property
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">{data.property.siteUrl}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Google reports {data.property.permissionLevel} · {data.snapshotCount} stored
                  snapshots · last observed {formatWhen(data.property.lastObservedAt)}
                </p>
              </div>
              <StatePill
                label={data.property.eligible ? "eligible" : "not eligible"}
                tone={data.property.eligible ? "positive" : "warning"}
              />
            </div>
            <p className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {data.comparison.status === "ready"
                ? "Two complete 28-day calendar windows are stored for an equal-period comparison."
                : `Only ${data.comparison.availableDays} of ${data.comparison.requiredDays} required calendar days are stored, so no trend is shown yet.`}{" "}
              No traffic estimate, score, or recommendation is derived from this evidence.
            </p>
          </GlassCard>

          <PageAuditCallout />

          <SectionCard
            id="overview"
            title="Overview"
            description={`Property totals for each finalized Pacific date. Latest finalized date: ${fmtDate(data.latestDate)}.`}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile
                label="Clicks"
                value={latest ? fmtInt(latest.clicks) : "—"}
                hint={fmtDate(data.latestDate)}
              />
              <MetricTile
                label="Impressions"
                value={latest ? fmtInt(latest.impressions) : "—"}
                hint={fmtDate(data.latestDate)}
              />
              <MetricTile
                label="CTR"
                value={latest ? fmtCtr(latest.ctr) : "—"}
                hint="Clicks divided by impressions"
              />
              <MetricTile
                label="Avg position"
                value={latest ? fmtPosition(latest.position) : "—"}
                hint="Lower is better"
              />
            </div>

            <div className="mt-4 rounded-xl border border-border/60 p-4">
              <h3 className="text-sm font-semibold text-foreground">28 days vs previous 28 days</h3>
              {data.comparison.status === "insufficient" ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Waiting for a complete 56-day calendar history. {data.comparison.availableDays} of{" "}
                  {data.comparison.requiredDays} required dates are stored through{" "}
                  {fmtDate(data.comparison.latestDate)}.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="py-2 pr-4 font-medium" scope="col">
                          Metric
                        </th>
                        <th className="py-2 pr-4 text-right font-medium" scope="col">
                          Previous ({data.comparison.previous.startDate}–
                          {data.comparison.previous.endDate})
                        </th>
                        <th className="py-2 pr-4 text-right font-medium" scope="col">
                          Current ({data.comparison.current.startDate}–
                          {data.comparison.current.endDate})
                        </th>
                        <th className="py-2 text-right font-medium" scope="col">
                          Change
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/40">
                        <td className="py-2 pr-4 text-foreground">Clicks</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtInt(data.comparison.previous.clicks)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtInt(data.comparison.current.clicks)}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {percentChange(data.comparison.change.clicksPercent)}
                        </td>
                      </tr>
                      <tr className="border-b border-border/40">
                        <td className="py-2 pr-4 text-foreground">Impressions</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtInt(data.comparison.previous.impressions)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtInt(data.comparison.current.impressions)}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {percentChange(data.comparison.change.impressionsPercent)}
                        </td>
                      </tr>
                      <tr className="border-b border-border/40">
                        <td className="py-2 pr-4 text-foreground">CTR</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtCtr(data.comparison.previous.ctr)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtCtr(data.comparison.current.ctr)}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {data.comparison.change.ctrPoints === null
                            ? "No comparison"
                            : signed(data.comparison.change.ctrPoints, " points")}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 pr-4 text-foreground">Avg position</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtPosition(data.comparison.previous.position)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtPosition(data.comparison.current.position)}
                        </td>
                        <td className="py-2 text-right text-muted-foreground">
                          {data.comparison.change.position === null
                            ? "No comparison"
                            : `${Math.abs(data.comparison.change.position).toFixed(1)} ${data.comparison.change.position <= 0 ? "better" : "worse"}`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    CTR is recomputed from total clicks and impressions. Average position is
                    impression-weighted; lower is better.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Date (Pacific)
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Clicks
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Impressions
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      CTR
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">
                      Avg position
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Collected
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyTotals.map((day) => (
                    <tr key={day.date} className="border-b border-border/40 last:border-b-0">
                      <td className="py-2 pr-4 text-foreground">{day.date}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                        {fmtInt(day.clicks)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                        {fmtInt(day.impressions)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {fmtCtr(day.ctr)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {fmtPosition(day.position)}
                      </td>
                      <td className="py-2 text-right text-xs text-muted-foreground">
                        {formatWhen(day.collectedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            id="findings"
            title="Rule findings"
            description="What the nightly rules concluded from this evidence: pages and queries that need attention, each linked to its card in the Recommendation Queue."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                label="Pages inspected"
                value={String(findings.data.inspectionCoverage.urlsInspected)}
                hint="Distinct URLs with a stored inspection"
              />
              <MetricTile
                label="Not indexed"
                value={String(findings.data.inspectionCoverage.notIndexed)}
                hint="Latest inspection did not pass"
              />
              <MetricTile
                label="Canonical or crawl drift"
                value={String(
                  findings.data.inspectionCoverage.canonicalMismatch +
                    findings.data.inspectionCoverage.staleCrawl,
                )}
                hint={`${findings.data.inspectionCoverage.canonicalMismatch} canonical · ${findings.data.inspectionCoverage.staleCrawl} stale crawl`}
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
                No findings stored yet. They appear after the nightly observation runs over
                collected evidence.
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
                            {RULE_LABEL[finding.rule] ?? finding.rule} · observed{" "}
                            {fmtDate(finding.periodEndPt)}
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
                              <Link
                                to="/recommendations/$id"
                                params={{ id: finding.recommendationId }}
                              >
                                Review
                              </Link>
                            </Button>
                          ) : null}
                          {finding.recommendationId && DRAFTABLE_RULES.has(finding.rule) ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={draftMutation.isPending}
                              onClick={() =>
                                draftMutation.mutate(finding.recommendationId as string)
                              }
                            >
                              {draftMutation.isPending ? "Drafting…" : "Draft the fix"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            id="pages"
            title="Pages"
            description={`Pages that earned impressions on ${fmtDate(data.latestDate)}.`}
          >
            <RowTable rows={data.pages} label="Page" emptyTitle="No page rows stored" />
          </SectionCard>

          <SectionCard
            id="queries"
            title="Queries"
            description={`Queries Google disclosed for ${fmtDate(data.latestDate)}. Low volume queries are withheld by Google, so this is a floor, not the full picture.`}
          >
            <RowTable rows={data.queries} label="Query" emptyTitle="No query rows stored" />
          </SectionCard>

          <SectionCard
            id="page-query"
            title="Page + query"
            description={`Which query brought impressions to which page on ${fmtDate(data.latestDate)}.`}
          >
            <RowTable
              rows={data.pageQueries}
              label="Page and query"
              emptyTitle="No page and query pairs stored"
            />
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              id="devices"
              title="Devices"
              description="Device split for the latest finalized date."
            >
              <RowTable rows={data.devices} label="Device" emptyTitle="No device rows stored" />
            </SectionCard>
            <SectionCard
              id="countries"
              title="Countries"
              description="Country split for the latest finalized date."
            >
              <RowTable rows={data.countries} label="Country" emptyTitle="No country rows stored" />
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              id="search-appearance"
              title="Search appearance"
              description="Which rich result types earned impressions on the latest finalized date. An empty list means Google recorded no enhanced appearances, so add structured data to compete for them."
            >
              <RowTable
                rows={data.searchAppearance}
                label="Appearance"
                emptyTitle="No search appearance rows stored"
              />
            </SectionCard>
            <SectionCard
              id="surfaces"
              title="Surfaces beyond web search"
              description="Image, video, news, Discover and Google News totals for the latest finalized date. Zero means Google recorded no activity there, not a missing read."
            >
              {data.surfaces.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No surface totals stored yet. Run a Search Console collection to record them.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {data.surfaces.map((surface) => (
                    <li
                      key={surface.surface}
                      className="flex items-center justify-between gap-3 py-2 text-xs"
                    >
                      <span className="font-medium capitalize text-foreground">
                        {surface.surface}
                      </span>
                      <span className="text-muted-foreground">
                        {surface.clicks.toLocaleString()} clicks ·{" "}
                        {surface.impressions.toLocaleString()} impressions
                        {surface.position === null ? "" : ` · pos ${surface.position.toFixed(1)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard
            id="indexing"
            title="URL indexing & sitemaps"
            description="Inspect Google's indexed version of one owned page, or explicitly submit a sitemap. These are separate actions with separate evidence."
          >
            <div className="space-y-6">
              <section aria-labelledby="url-inspection-heading">
                <h3 id="url-inspection-heading" className="text-sm font-semibold text-foreground">
                  Inspect one page
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  This read-only call reports the version Google has indexed. It does not test the
                  live page and it does not request indexing.
                </p>
                <form
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const url = inspectionUrl.trim();
                    if (!url) {
                      toast.error("Enter a page URL to inspect.");
                      return;
                    }
                    inspectionMutation.mutate(url);
                  }}
                >
                  <Input
                    aria-label="Owned page URL to inspect"
                    type="url"
                    value={inspectionUrl}
                    onChange={(event) => setInspectionUrl(event.target.value)}
                    placeholder={ownedRoot}
                    disabled={busy}
                  />
                  <Button type="submit" disabled={busy || inspectionUrl.trim() === ""}>
                    {inspectionMutation.isPending ? "Inspecting…" : "Inspect URL"}
                  </Button>
                </form>

                {data.recentInspections.length === 0 ? (
                  <p className="mt-3 rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                    No page has been inspected from AOOS yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {data.recentInspections.map((inspection) => (
                      <li key={inspection.id} className="rounded-xl border border-border/60 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="break-all text-sm font-medium text-foreground">
                              {trimUrl(inspection.inspectedUrl)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Inspected {formatWhen(inspection.inspectedAt)} · last crawled{" "}
                              {formatWhen(inspection.lastCrawlTime)}
                            </p>
                          </div>
                          <StatePill
                            label={inspection.verdict.toLowerCase()}
                            tone={
                              inspection.verdict === "PASS"
                                ? "positive"
                                : inspection.verdict === "FAIL"
                                  ? "danger"
                                  : "neutral"
                            }
                          />
                        </div>
                        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <dt className="inline">Coverage: </dt>
                            <dd className="inline text-foreground">
                              {inspection.coverageState ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Fetch: </dt>
                            <dd className="inline text-foreground">
                              {inspection.pageFetchState ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Indexing: </dt>
                            <dd className="inline text-foreground">
                              {inspection.indexingState ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">robots.txt: </dt>
                            <dd className="inline text-foreground">
                              {inspection.robotsTxtState ?? "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Crawled as: </dt>
                            <dd className="inline text-foreground">
                              {inspection.crawledAs ?? "—"}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="inline">Google canonical: </dt>
                            <dd className="inline break-all text-foreground">
                              {inspection.googleCanonical ?? "—"}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="inline">Declared canonical: </dt>
                            <dd className="inline break-all text-foreground">
                              {inspection.userCanonical ?? "—"}
                            </dd>
                          </div>
                        </dl>
                        {inspection.inspectionResultLink ? (
                          <a
                            href={inspection.inspectionResultLink}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
                          >
                            Open this result in Search Console
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="sitemap-heading" className="border-t border-border/60 pt-5">
                <h3 id="sitemap-heading" className="text-sm font-semibold text-foreground">
                  Submit or resubmit a sitemap
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Submission asks Google to process the sitemap; it does not guarantee crawling or
                  indexing. Nothing is sent until you confirm the exact URL.
                </p>
                <form
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const url = sitemapUrl.trim();
                    if (!url) {
                      toast.error("Enter a sitemap URL.");
                      return;
                    }
                    setPendingSitemap(url);
                  }}
                >
                  <Input
                    aria-label="Owned sitemap URL"
                    type="url"
                    value={sitemapUrl}
                    onChange={(event) => setSitemapUrl(event.target.value)}
                    placeholder={`${ownedRoot.replace(/\/$/, "")}/sitemap.xml`}
                    disabled={busy}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={busy || sitemapUrl.trim() === ""}
                  >
                    Submit sitemap
                  </Button>
                </form>

                {data.sitemaps.length === 0 ? (
                  <EmptyState
                    title="No sitemap status stored"
                    description="The latest observation did not include a sitemap payload for this property."
                  />
                ) : (
                  <ul className="mt-4 space-y-3">
                    {data.sitemaps.map((sitemap) => (
                      <li
                        key={sitemap.path}
                        className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="break-all text-sm font-medium text-foreground">
                            {trimUrl(sitemap.path)}
                          </p>
                          <div className="flex items-center gap-2">
                            <StatePill
                              label={
                                sitemap.isPending
                                  ? "pending"
                                  : (sitemap.errors ?? 0) > 0
                                    ? "errors"
                                    : "processed"
                              }
                              tone={
                                sitemap.isPending
                                  ? "warning"
                                  : (sitemap.errors ?? 0) > 0
                                    ? "danger"
                                    : "positive"
                              }
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setSitemapUrl(sitemap.path);
                                setPendingSitemap(sitemap.path);
                              }}
                            >
                              Resubmit
                            </Button>
                          </div>
                        </div>
                        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                          <div>
                            <dt className="inline">Submitted URLs: </dt>
                            <dd className="inline text-foreground">{sitemap.submitted ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="inline">Indexed URLs: </dt>
                            <dd className="inline text-foreground">{sitemap.indexed ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="inline">Type: </dt>
                            <dd className="inline text-foreground">{sitemap.type ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="inline">Warnings: </dt>
                            <dd className="inline text-foreground">{sitemap.warnings ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="inline">Errors: </dt>
                            <dd className="inline text-foreground">{sitemap.errors ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="inline">Last submitted: </dt>
                            <dd className="inline text-foreground">
                              {formatWhen(sitemap.lastSubmitted)}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline">Last downloaded: </dt>
                            <dd className="inline text-foreground">
                              {formatWhen(sitemap.lastDownloaded)}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}

                {data.sitemapSubmissions.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-border/60 p-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      AOOS submission history
                    </h4>
                    <ul className="mt-2 space-y-2 text-xs">
                      {data.sitemapSubmissions.slice(0, 5).map((submission) => (
                        <li
                          key={submission.id}
                          className="flex flex-wrap items-start justify-between gap-2"
                        >
                          <span className="break-all text-foreground">
                            {trimUrl(submission.sitemapUrl)}
                          </span>
                          <span
                            className={
                              submission.status === "submitted"
                                ? "text-emerald-600"
                                : "text-destructive"
                            }
                          >
                            {submission.status} · {formatWhen(submission.submittedAt)}
                          </span>
                          {submission.failureReason ? (
                            <span className="w-full text-destructive">
                              {submission.failureReason}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="mt-3 text-xs text-muted-foreground">
                  Google provider charge: $0 per request. Google API quota still applies. This
                  direct screen action does not run Lovable AI.
                </p>
              </section>
            </div>

            <AlertDialog
              open={pendingSitemap !== null}
              onOpenChange={(open) => {
                if (!open && !sitemapMutation.isPending) setPendingSitemap(null);
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Submit this sitemap to Google?</AlertDialogTitle>
                  <AlertDialogDescription>
                    AOOS will send one Search Console sitemap submission for{" "}
                    {pendingSitemap ?? "the selected URL"}. Google may accept the request without
                    crawling or indexing every URL. The attempt and any error will be retained in
                    AOOS.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={sitemapMutation.isPending}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={sitemapMutation.isPending || !pendingSitemap}
                    onClick={() => {
                      if (pendingSitemap) sitemapMutation.mutate(pendingSitemap);
                    }}
                  >
                    {sitemapMutation.isPending ? "Submitting…" : "Submit to Google"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </SectionCard>
        </>
      )}
    </div>
  );
}
