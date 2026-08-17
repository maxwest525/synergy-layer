import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { GlassCard, PageHeader, StatePill, formatWhen } from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import {
  COVERAGE_LABELS,
  COVERAGE_TONE,
  concernStatus,
  groupByPhase,
  summarizeCoverage,
  type CoverageStatus,
} from "@/lib/coverage";
import { getCoverage } from "@/lib/coverage.functions";
import {
  backlinkAuthority,
  describePageSpeed,
  changeStatus,
  evidenceStatus,
  indexingStatus,
  systemGap,
  systemStatus,
  STATUS_LABELS,
  STATUS_TONE,
  type EssentialStatus,
} from "@/lib/essentials";
import { getEssentials } from "@/lib/essentials.functions";
import { getTenantContext } from "@/lib/tenant.functions";


export const Route = createFileRoute("/essentials")({
  // Operator-only status screen: without the operator bearer token a server
  // render is empty and the client immediately replaces it.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Essentials — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "What marketing coverage AOOS actually has today and what is still missing, concern by concern, in plain language.",
      },
      { property: "og:title", content: "Essentials — AOOS Marketing Operating System" },
      {
        property: "og:description",
        content: "Operator status for every marketing essential, based only on stored evidence.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: EssentialsPage,
});

const ACTION_CLASS =
  "inline-flex items-center rounded-lg border border-primary/50 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10";

type Action =
  | {
      label: string;
      to:
        | "/search"
        | "/keywords"
        | "/competitors"
        | "/capabilities/systems"
        | "/ads"
        | "/recommendations"
        | "/measurement";
    }
  | { label: string; to: "/changes/$id"; params: { id: string } }
  | { label: string; to: "/capabilities/systems/$key"; params: { key: string } };

type Concern = {
  id: string;
  title: string;
  status: EssentialStatus;
  evidence: ReactNode;
  gap: string;
  action?: Action;
  references?: { label: string; href: string }[];
};

function ConcernCard({ concern }: { concern: Concern }) {
  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{concern.title}</h3>
        <StatePill label={STATUS_LABELS[concern.status]} tone={STATUS_TONE[concern.status]} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{concern.evidence}</p>
      <p className="mt-2 text-sm text-foreground/80">{concern.gap}</p>
      {concern.references ? (
        <ul className="mt-3 space-y-1">
          {concern.references.map((reference) => (
            <li key={reference.href}>
              <a
                href={reference.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {reference.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {concern.action ? (
        <div className="mt-3">
          {concern.action.to === "/changes/$id" ? (
            <Link to="/changes/$id" params={concern.action.params} className={ACTION_CLASS}>
              {concern.action.label}
            </Link>
          ) : concern.action.to === "/capabilities/systems/$key" ? (
            <Link
              to="/capabilities/systems/$key"
              params={concern.action.params}
              className={ACTION_CLASS}
            >
              {concern.action.label}
            </Link>
          ) : (
            <Link to={concern.action.to} className={ACTION_CLASS}>
              {concern.action.label}
            </Link>
          )}
        </div>
      ) : null}
    </GlassCard>
  );
}

function Group({ title, concerns }: { title: string; concerns: Concern[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {concerns.map((concern) => (
          <ConcernCard key={concern.id} concern={concern} />
        ))}
      </div>
    </section>
  );
}


const COVERAGE_ORDER: CoverageStatus[] = [
  "broken",
  "unproven",
  "not_evaluated",
  "cannot_measure",
  "working",
];

function CoverageSection({
  concerns,
}: {
  concerns: ReturnType<typeof groupByPhase>[number]["concerns"];
}) {
  const phases = groupByPhase(concerns);
  const totals = summarizeCoverage(concerns);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Coverage framework
        </h2>
        <p className="text-xs text-muted-foreground">
          {concerns.length} concern(s) across {phases.length} phase(s)
        </p>
      </div>
      <GlassCard className="p-5">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {COVERAGE_ORDER.map((status) => (
            <div key={status} className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-foreground">{totals[status]}</span>
              <StatePill label={COVERAGE_LABELS[status]} tone={COVERAGE_TONE[status]} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Each concern shows a status only when a stored evaluation produced one. Nothing here is
          typed by hand, so a concern with no evaluation says so instead of looking healthy.
        </p>
      </GlassCard>
      <div className="space-y-6">
        {phases.map((phase) => (
          <div key={phase.phase} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {phase.phase}
            </h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {phase.concerns.map((concern) => {
                const status = concernStatus(concern);
                return (
                  <GlassCard key={concern.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h4 className="text-sm font-semibold text-foreground">{concern.task}</h4>
                      <StatePill label={COVERAGE_LABELS[status]} tone={COVERAGE_TONE[status]} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{concern.description}</p>
                    {concern.latest ? (
                      <>
                        <p className="mt-2 text-sm text-foreground/80">{concern.latest.summary}</p>
                        {concern.latest.limitation ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Limitation: {concern.latest.limitation}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Evaluated {formatWhen(concern.latest.evaluatedAt)}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-foreground/80">
                        No evaluation has been stored for this concern yet, so AOOS makes no claim
                        about it either way.
                      </p>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EssentialsPage() {
  const loadTenantContext = useServerFn(getTenantContext);
  const loadEssentials = useServerFn(getEssentials);
  const loadCoverage = useServerFn(getCoverage);

  const tenant = useSuspenseQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadTenantContext(),
    retry: false,
  });
  const activeTenantId = tenant.data.activeTenantId;

  const { data } = useSuspenseQuery({
    queryKey: ["essentials", activeTenantId],
    queryFn: () => loadEssentials(),
    retry: false,
  });

  const coverage = useSuspenseQuery({
    queryKey: ["coverage", activeTenantId],
    queryFn: () => loadCoverage(),
    retry: false,
  });


  const gsc = data.gsc;
  const system = (key: string) => data.systems[key] ?? null;
  const pagespeed = describePageSpeed(data.pagespeed);
  const authority = backlinkAuthority({
    snapshotCount: data.backlinks.snapshots,
    referringDomains: data.backlinks.referringDomains,
    backlinks: data.backlinks.backlinks,
    storedSufficient: data.backlinks.storedSufficient,
  });

  const searchConsole: Concern[] = [
    {
      id: "gsc-connection",
      title: "Search Console connection",
      status: data.property ? "live" : systemStatus(system("api.search_console")),
      evidence: data.property
        ? `Property ${data.property.siteUrl}, permission ${data.property.permissionLevel}. Last observed ${formatWhen(data.property.lastObservedAt)}. ${data.propertyCount} property record(s) stored.`
        : "No Search Console property record is stored for this workspace yet.",
      gap: data.property
        ? `AOOS currently collects the selected property ${data.property.siteUrl}. ${data.propertyCount} property record(s) are stored, and nothing outside them is observed.`
        : systemGap(system("api.search_console"), "Search Console"),

      action: { label: "Open Search evidence", to: "/search" },
    },
    {
      id: "gsc-metrics",
      title: "Search Console metrics",
      status: evidenceStatus(gsc.snapshotCount, gsc.totalsDays >= 28),
      evidence: `${gsc.snapshotCount} stored snapshot(s). Latest finalized date ${gsc.latestDate ?? "none"}, collected ${formatWhen(gsc.collectedAt)}: ${gsc.latestClicks} clicks and ${gsc.latestImpressions} impressions, ${gsc.pageRows} page row(s) and ${gsc.queryRows} query row(s).`,
      gap: `Only ${gsc.totalsDays} finalized day(s) of totals are stored, and the site returns very few rows, so trends and comparisons are not reliable yet.`,
      action: { label: "Open Search evidence", to: "/search" },
    },
    {
      id: "indexing",
      title: "Indexing / URL inspection",
      status: indexingStatus(gsc.sitemapCount, false),
      evidence: `${gsc.sitemapCount} sitemap record(s) observed on ${gsc.latestDate ?? "no finalized date"}. No page-level index status is stored.`,
      gap: "URL Inspection is not wired, so AOOS cannot say whether a specific page is indexed.",
      action: { label: "Open Search evidence", to: "/search" },
    },
    {
      id: "sitemaps",
      title: "Sitemaps",
      status: evidenceStatus(gsc.sitemapCount, false),
      evidence:
        gsc.sitemapCount > 0
          ? `${gsc.sitemaps.count} sitemap(s) as Google reported them on ${gsc.latestDate ?? "the latest finalized date"}: ${gsc.sitemaps.submitted ?? "no"} URL(s) submitted, ${gsc.sitemaps.indexed ?? "no"} indexed, ${gsc.sitemaps.warnings ?? 0} warning(s) and ${gsc.sitemaps.errors ?? 0} error(s).`
          : "No sitemap rows were returned on the latest finalized date.",

      gap: "Sitemaps are read only. AOOS never submits or resubmits a sitemap.",
      action: { label: "Open Search evidence", to: "/search" },
    },
  ];

  const changesAndContent: Concern[] = [
    {
      id: "changes",
      title: "Recommended page changes",
      status: changeStatus(data.changes.proposed, data.changes.total),
      evidence: data.changes.latest
        ? `${data.changes.proposed} awaiting a decision of ${data.changes.total} total. Latest: "${data.changes.latest.title}" for ${data.changes.latest.targetUrl}, proposed ${formatWhen(data.changes.latest.proposedAt)}.`
        : "No concrete page change has been proposed yet.",
      gap: "Approval authorizes the exact before/after values on the change request. AOOS does not edit or publish the site.",
      ...(data.changes.latest
        ? {
            action: {
              label: "Open the proposed change",
              to: "/changes/$id" as const,
              params: { id: data.changes.latest.id },
            },
          }
        : { action: { label: "Open recommendations", to: "/recommendations" as const } }),
    },
    {
      id: "onpage",
      title: "On-page technical SEO",
      status: systemStatus(system("sys.openseo")),
      evidence:
        "OpenSEO is catalogued in the tool estate. AOOS holds no crawl, audit, or on-page finding from it.",
      gap: systemGap(system("sys.openseo"), "OpenSEO"),
      action: {
        label: "Open the OpenSEO system record",
        to: "/capabilities/systems/$key" as const,
        params: { key: "sys.openseo" },
      },
    },
    {
      id: "meta-checks",
      title: "Title, meta and H1 character checks",
      status: systemStatus(system("sys.openseo")) === "local" ? "local" : "not_wired",
      evidence:
        "No stored title, description, or heading length measurement exists in AOOS for any page.",
      gap: "Character length checks would come from an on-page crawl, and no crawl result is connected to AOOS yet.",
      action: {
        label: "Open the OpenSEO system record",
        to: "/capabilities/systems/$key" as const,
        params: { key: "sys.openseo" },
      },
    },
    {
      id: "pagespeed",
      title: "PageSpeed / Core Web Vitals",
      status: pagespeed.status,
      evidence: pagespeed.evidence,
      gap: pagespeed.gap,
      action: { label: "Open Measurement", to: "/measurement" as const },
    },
    {
      id: "guidance",
      title: "Google Search guidance",
      status: "reference",
      evidence:
        "Reference documentation only. Nothing on this row is measured, stored, or scored by AOOS.",
      gap: "Guidance is not evidence. Any change it inspires still has to become a proposed page change.",
      references: [
        {
          label: "Search Essentials",
          href: "https://developers.google.com/search/docs/essentials",
        },
        {
          label: "AI optimization guide",
          href: "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
        },
        {
          label: "A new resource for optimizing",
          href: "https://developers.google.com/search/blog/2026/05/a-new-resource-for-optimizing",
        },
      ],
    },
  ];

  const visibility: Concern[] = [
    {
      id: "organic",
      title: "Organic search visibility",
      status: evidenceStatus(data.serp.snapshots, false),
      evidence: `${data.serp.snapshots} stored organic SERP snapshot(s) from DataForSEO, latest ${formatWhen(data.serp.latestAt)}.`,
      gap: "Snapshots are one-off observations, not a tracked rank history, and no page in AOOS displays them yet.",
    },

    {
      id: "keywords",
      title: "Keywords",
      status: evidenceStatus(data.keywords.tracked, data.keywords.pendingCandidates === 0),
      evidence: `${data.keywords.tracked} tracked keyword(s) approved and active. ${data.keywords.pendingCandidates} candidate(s) awaiting review${data.keywords.latestCandidateAt ? `, newest ${formatWhen(data.keywords.latestCandidateAt)}` : ""}.`,
      gap: "Tracked keywords come from operator approval of provider candidates. There is no automated refresh loop yet.",
      action: { label: "Open keywords", to: "/keywords" },
    },
    {
      id: "negative-keywords",
      title: "Negative keywords",
      status: systemStatus(system("api.google_ads_v25")),
      evidence: "No negative keyword list is stored in AOOS.",
      gap: "Negative keywords live on the Google Ads surface, which is catalogued but not wired into AOOS.",
      action: {
        label: "Open the Google Ads system record",
        to: "/capabilities/systems/$key" as const,
        params: { key: "api.google_ads_v25" },
      },
    },
    {
      id: "keyword-planner",
      title: "Google Keyword Planner",
      status: systemStatus(system("api.google_ads_v25")),
      evidence:
        "No Keyword Planner volume or forecast data is stored in AOOS. Keyword volume shown elsewhere comes from DataForSEO.",
      gap: "Keyword Planner is reached through the Google Ads API, which is catalogued but not wired into AOOS.",
      action: {
        label: "Open the Google Ads system record",
        to: "/capabilities/systems/$key" as const,
        params: { key: "api.google_ads_v25" },
      },
    },
  ];

  const authorityGroup: Concern[] = [
    {
      id: "offpage",
      title: "Off-page SEO",
      status: evidenceStatus(data.backlinks.snapshots, false),
      evidence: `${data.backlinks.snapshots} stored backlink snapshot(s), latest ${formatWhen(data.backlinks.latestAt)}.`,
      gap: "Off-page work is observation only today, and no page in AOOS displays these stored snapshots yet.",
    },
    {
      id: "backlinks",
      title: "Backlinks",
      status: evidenceStatus(data.backlinks.snapshots, false),
      evidence: `${data.backlinks.referringDomains} referring domain(s) and ${data.backlinks.backlinks} link(s) in the stored summary${data.backlinks.spamScore === null ? "" : `, provider spam score ${data.backlinks.spamScore}`}.`,
      gap: "The stored sample is small and was collected once, so it is a baseline rather than a monitored profile. There is no backlink evidence page to open yet.",
    },
    {
      id: "authority",
      title: "Authority",
      status: authority.status,
      evidence: authority.note,
      gap: authority.sufficient
        ? "No authority trend exists yet because only one collection has been stored."
        : "AOOS will not display an authority score until stored backlink evidence explicitly records the sample as sufficient.",
    },
  ];

  const measurement: Concern[] = [
    {
      id: "analytics",
      title: "Google Analytics",
      status: systemStatus(system("api.ga4_data")),
      evidence:
        "GA4 Data API, Analytics Admin API, and Tag Manager have configuration metadata catalogued. No session, conversion, or traffic row is stored in AOOS.",
      gap: systemGap(system("api.ga4_data"), "GA4 Data API"),
      action: {
        label: "Open the GA4 system record",
        to: "/capabilities/systems/$key" as const,
        params: { key: "api.ga4_data" },
      },
    },
    {
      id: "google-ads",
      title: "Google Ads",
      status: systemStatus(system("api.google_ads_v25")),
      evidence: "No Google Ads account, campaign, or spend row is stored in AOOS.",
      gap: systemGap(system("api.google_ads_v25"), "Google Ads API"),
      action: {
        label: "Open the Google Ads system record",
        to: "/capabilities/systems/$key" as const,
        params: { key: "api.google_ads_v25" },
      },
    },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Evidence"
        title="Marketing essentials"
        description="What is covered and what is missing. Every status below comes from evidence AOOS already stored. Configuration is never shown as a connection, and this page only navigates: it never runs a workflow or calls a provider."
      />
      <Group title="Search Console" concerns={searchConsole} />
      <Group title="Changes and on-page" concerns={changesAndContent} />
      <Group title="Visibility and keywords" concerns={visibility} />
      <Group title="Off-page and authority" concerns={authorityGroup} />
      <Group title="Measurement and paid" concerns={measurement} />
    </div>
  );
}
