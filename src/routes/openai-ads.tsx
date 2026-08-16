import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import {
  DetailRow,
  EmptyState,
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
  formatWhen,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { getOpenAiAdsState, type OpenAiAdsState } from "@/lib/openai-ads.functions";
import type { OpenAiAdsEventView, SurfaceHealth } from "@/lib/openai-ads/config";

export const Route = createFileRoute("/openai-ads")({
  // Operator surface: the read needs the operator bearer token.
  ssr: false,
  head: () => ({
    meta: [
      { title: "OpenAI Ads — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "Monitor the OpenAI Ads pixel and server-side event path for the instrumented TruMove site: real logged events, delivery status, shared event ids, and connection requirements.",
      },
      { property: "og:title", content: "OpenAI Ads — AOOS Marketing Operating System" },
      {
        property: "og:description",
        content:
          "Real OpenAI Ads instrumentation evidence only. No spend, CPC, ROAS, or campaign metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: OpenAiAdsPage,
});

function healthTone(state: SurfaceHealth["state"]) {
  switch (state) {
    case "receiving":
      return "positive" as const;
    case "stale":
      return "warning" as const;
    case "failing":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function healthLabel(state: SurfaceHealth["state"]): string {
  switch (state) {
    case "receiving":
      return "receiving events";
    case "stale":
      return "no recent events";
    case "failing":
      return "delivery failing";
    default:
      return "not connected";
  }
}

function SurfaceCard({ title, health }: { title: string; health: SurfaceHealth }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <StatePill label={healthLabel(health.state)} tone={healthTone(health.state)} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{health.reason}</p>
      <dl className="mt-3">
        <DetailRow label="Events stored" value={health.eventCount} />
        <DetailRow label="Failed deliveries" value={health.failureCount} />
        <DetailRow label="Last event" value={formatWhen(health.lastEventAt)} />
      </dl>
    </GlassCard>
  );
}

function EventTable({ events }: { events: OpenAiAdsEventView[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-medium">Event</th>
            <th className="py-2 pr-4 font-medium">Source</th>
            <th className="py-2 pr-4 font-medium">Path</th>
            <th className="py-2 pr-4 font-medium">Event id</th>
            <th className="py-2 pr-4 font-medium">Delivery</th>
            <th className="py-2 font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-t border-border/50">
              <td className="py-2 pr-4 font-medium text-foreground">{event.eventName}</td>
              <td className="py-2 pr-4 text-muted-foreground">
                {event.transport === "browser" ? "Browser pixel" : "Server side"}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{event.sourcePath ?? "Not set"}</td>
              <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{event.eventId}</td>
              <td className="py-2 pr-4">
                <StatePill
                  label={event.deliveryStatus}
                  tone={
                    event.deliveryStatus === "failed"
                      ? "danger"
                      : event.deliveryStatus === "delivered"
                        ? "positive"
                        : "neutral"
                  }
                />
              </td>
              <td className="py-2 text-muted-foreground">{formatWhen(event.occurredAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpenAiAdsPage() {
  const read = useServerFn(getOpenAiAdsState);
  const { data } = useSuspenseQuery<OpenAiAdsState>({
    queryKey: ["openai-ads-state"],
    queryFn: () => read({ data: undefined }),
  });

  const tracked = ["page_viewed", "lead_created"] as const;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Paid media instrumentation"
        title="OpenAI Ads"
        description="Real instrumentation evidence for the monitored pixel. AOOS has no authenticated read against an OpenAI Ads account, so spend, cost per click, return on ad spend, and campaign delivery are not shown anywhere on this page."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Pixel id" value={data.pixelId} hint={data.sourceProject} />
        <MetricTile
          label="Events stored"
          value={data.totalEvents}
          hint="Counted from logged events only"
        />
        <MetricTile label="Last event" value={formatWhen(data.lastEventAt)} hint="UTC" />
        <MetricTile
          label="Shared event ids"
          value={data.dedup.sharedEventIds}
          hint="Seen on both the browser and server paths"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SurfaceCard title="Browser pixel health" health={data.browser} />
        <SurfaceCard title="Server-side events health" health={data.capi} />
      </div>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Connection</h2>
        <dl className="mt-2">
          <DetailRow
            label="Cross-project bridge secret"
            value={
              <StatePill
                label={data.bridge.configured ? "configured" : "not configured"}
                tone={data.bridge.configured ? "positive" : "warning"}
              />
            }
          />
          <DetailRow
            label="Server-side conversions key"
            value={
              <StatePill
                label={data.bridge.capiSecretPresent ? "configured" : "not configured"}
                tone={data.bridge.capiSecretPresent ? "positive" : "warning"}
              />
            }
          />
          <DetailRow
            label="Bridge endpoint"
            value={<span className="font-mono text-xs">{data.bridge.endpointPath}</span>}
          />
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">{data.bridge.requirement}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Secret values stay server side. Neither the bridge secret nor the conversions key is ever
          sent to the browser.
        </p>
      </GlassCard>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Tracked events</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {tracked.map((name) => {
            const bucket = data.eventCounts[name];
            return (
              <GlassCard key={name} className="p-5">
                <p className="text-sm font-medium text-foreground">{name}</p>
                {bucket ? (
                  <dl className="mt-2">
                    <DetailRow label="Total logged" value={bucket.total} />
                    <DetailRow label="Browser pixel" value={bucket.browser} />
                    <DetailRow label="Server side" value={bucket.capi} />
                    <DetailRow label="Last seen" value={formatWhen(bucket.lastAt)} />
                  </dl>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No {name} event has reached this project yet.
                  </p>
                )}
              </GlassCard>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Deduplication</h2>
        <GlassCard className="p-5">
          <dl>
            <DetailRow label="Event ids seen on both paths" value={data.dedup.sharedEventIds} />
            <DetailRow label="Browser only" value={data.dedup.browserOnly} />
            <DetailRow label="Server side only" value={data.dedup.capiOnly} />
          </dl>
          <p className="mt-3 text-sm text-muted-foreground">
            Deduplication is only provable for event ids observed on both paths. One sided ids are
            reported as one sided rather than assumed deduplicated.
          </p>
        </GlassCard>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Source paths</h2>
        {data.sourcePaths.length === 0 ? (
          <EmptyState
            title="No source paths recorded"
            description="Source paths appear once the instrumented site reports events over the bridge."
          />
        ) : (
          <GlassCard className="p-5">
            <dl>
              {data.sourcePaths.map((row) => (
                <DetailRow key={row.path} label={row.path} value={row.count} />
              ))}
            </dl>
          </GlassCard>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Delivery errors</h2>
        {data.failedEvents.length === 0 ? (
          <EmptyState
            title="No failed deliveries recorded"
            description="Failed events appear here exactly as the instrumented site reported them."
          />
        ) : (
          <GlassCard className="p-5">
            <ul className="space-y-3">
              {data.failedEvents.map((event) => (
                <li key={event.id} className="border-b border-border/50 pb-3 last:border-b-0">
                  <p className="text-sm font-medium text-foreground">
                    {event.eventName} · {event.transport === "browser" ? "browser" : "server side"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {event.deliveryError ?? "No error detail was reported."}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatWhen(event.occurredAt)}</p>
                </li>
              ))}
            </ul>
          </GlassCard>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Recent events</h2>
        {data.recentEvents.length === 0 ? (
          <EmptyState
            title="No events connected yet"
            description="This project has not received any OpenAI Ads events. Nothing is estimated or filled in while the bridge is unconnected."
          />
        ) : (
          <GlassCard className="p-5">
            <EventTable events={data.recentEvents} />
          </GlassCard>
        )}
      </section>
    </div>
  );
}
