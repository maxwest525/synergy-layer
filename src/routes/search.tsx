import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { EmptyState, GlassCard, MetricTile, PageHeader, StatePill, formatWhen } from "@/components/os/primitives";
import type { SearchRow } from "@/lib/search.functions";
import { getSearchWorkspace } from "@/lib/search.functions";

const workspaceQuery = {
  queryKey: ["search-workspace"],
  queryFn: () => getSearchWorkspace(),
};

export const Route = createFileRoute("/search")({
  // Operator-only workspace: rendering it server side without the operator
  // bearer token produces an empty tree the client immediately replaces.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Search workspace — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "What Google Search Console actually observed for the selected property: finalized daily clicks, impressions, CTR, average position, pages, queries, devices, countries, and sitemap status.",
      },
      { property: "og:title", content: "Search workspace — AOOS Marketing Operating System" },
      {
        property: "og:description",
        content: "Stored Search Console evidence, shown exactly as Google reported it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchWorkspacePage,
});

function fmtInt(value: number): string {
  return Math.round(value).toLocaleString();
}

function fmtCtr(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtPosition(value: number): string {
  return value === 0 ? "—" : value.toFixed(1);
}

function fmtDate(value: string | null): string {
  return value ?? "—";
}

function trimUrl(value: string): string {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "") || value;
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
              <td className="py-2 pr-4 text-right tabular-nums text-foreground">{fmtInt(row.clicks)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-foreground">{fmtInt(row.impressions)}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{fmtCtr(row.ctr)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{fmtPosition(row.position)}</td>
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

function SearchWorkspacePage() {
  const { data } = useSuspenseQuery(workspaceQuery);
  const latest = data.dailyTotals[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Search"
        title="What Search Console observed"
        description="Stored, finalized Google Search Console evidence for the selected property. Nothing here is modelled, scored, or projected."
        actions={
          <Link
            to="/capabilities"
            className="rounded-lg border border-primary/50 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Capabilities
          </Link>
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
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Selected property</p>
                <p className="mt-1 text-sm font-medium text-foreground">{data.property.siteUrl}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Google reports {data.property.permissionLevel} · {data.snapshotCount} stored snapshots ·
                  last observed {formatWhen(data.property.lastObservedAt)}
                </p>
              </div>
              <StatePill label={data.property.eligible ? "eligible" : "not eligible"} tone={data.property.eligible ? "positive" : "warning"} />
            </div>
            <p className="mt-4 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Evidence limits: only {data.dailyTotals.length} finalized Pacific dates are stored, and Search
              Console volume for this property is currently sparse. That is too little to read as a trend.
              No traffic estimate, score, or recommendation is derived from it.
            </p>
          </GlassCard>

          <SectionCard
            id="overview"
            title="Overview"
            description={`Property totals for each finalized Pacific date. Latest finalized date: ${fmtDate(data.latestDate)}.`}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricTile label="Clicks" value={latest ? fmtInt(latest.clicks) : "—"} hint={fmtDate(data.latestDate)} />
              <MetricTile
                label="Impressions"
                value={latest ? fmtInt(latest.impressions) : "—"}
                hint={fmtDate(data.latestDate)}
              />
              <MetricTile label="CTR" value={latest ? fmtCtr(latest.ctr) : "—"} hint="Clicks divided by impressions" />
              <MetricTile
                label="Avg position"
                value={latest ? fmtPosition(latest.position) : "—"}
                hint="Lower is better"
              />
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
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">{fmtInt(day.clicks)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">{fmtInt(day.impressions)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{fmtCtr(day.ctr)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                        {fmtPosition(day.position)}
                      </td>
                      <td className="py-2 text-right text-xs text-muted-foreground">{formatWhen(day.collectedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <RowTable rows={data.pageQueries} label="Page and query" emptyTitle="No page and query pairs stored" />
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard id="devices" title="Devices" description="Device split for the latest finalized date.">
              <RowTable rows={data.devices} label="Device" emptyTitle="No device rows stored" />
            </SectionCard>
            <SectionCard id="countries" title="Countries" description="Country split for the latest finalized date.">
              <RowTable rows={data.countries} label="Country" emptyTitle="No country rows stored" />
            </SectionCard>
          </div>

          <SectionCard
            id="indexing"
            title="Indexing & sitemaps"
            description="Sitemap status exactly as Search Console reports it. Indexed counts lag submission and are often reported as zero."
          >
            {data.sitemaps.length === 0 ? (
              <EmptyState
                title="No sitemap status stored"
                description="The latest observation did not include a sitemap payload for this property."
              />
            ) : (
              <ul className="space-y-3">
                {data.sitemaps.map((sitemap) => (
                  <li key={sitemap.path} className="border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{trimUrl(sitemap.path)}</p>
                      <StatePill
                        label={sitemap.isPending ? "pending" : (sitemap.errors ?? 0) > 0 ? "errors" : "processed"}
                        tone={sitemap.isPending ? "warning" : (sitemap.errors ?? 0) > 0 ? "danger" : "positive"}
                      />
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
                        <dd className="inline text-foreground">{formatWhen(sitemap.lastSubmitted)}</dd>
                      </div>
                      <div>
                        <dt className="inline">Last downloaded: </dt>
                        <dd className="inline text-foreground">{formatWhen(sitemap.lastDownloaded)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
