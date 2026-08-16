import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

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
import {
  getOpenAiAdsState,
  validateOpenAiAdsEvent,
  type OpenAiAdsState,
} from "@/lib/openai-ads.functions";
import type { OpenAiAdsEventView, SurfaceHealth } from "@/lib/openai-ads/config";
import { OPENAI_ADS_EVENT_CATALOG, type EventCoverageRow } from "@/lib/openai-ads/events";
import type { ValidationReport } from "@/lib/openai-ads/validation";

export const Route = createFileRoute("/openai-ads")({
  // Operator surface: the read needs the operator bearer token.
  ssr: false,
  head: () => ({
    meta: [
      { title: "OpenAI Ads — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "Monitor the OpenAI Ads pixel and server-side event path for the instrumented TruMove site: event coverage, delivery health, deduplication, attribution, and the exact configuration still required.",
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

function coverageTone(state: EventCoverageRow["state"]) {
  if (state === "active") return "positive" as const;
  if (state === "available") return "warning" as const;
  return "neutral" as const;
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
      <table className="w-full min-w-[52rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-medium">Event</th>
            <th className="py-2 pr-4 font-medium">Source</th>
            <th className="py-2 pr-4 font-medium">Path</th>
            <th className="py-2 pr-4 font-medium">Event id</th>
            <th className="py-2 pr-4 font-medium">Click ref</th>
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
              <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                {event.oppref ?? "None"}
              </td>
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

function ValidationControl({ available }: { available: boolean }) {
  const validate = useServerFn(validateOpenAiAdsEvent);
  const [eventName, setEventName] = useState("lead_created");
  const [eventId, setEventId] = useState("");
  const [transport, setTransport] = useState<"browser" | "capi">("browser");
  const [oppref, setOppref] = useState("");

  const mutation = useMutation<ValidationReport, Error>({
    mutationFn: () =>
      validate({
        data: {
          eventName,
          eventId: eventId.trim(),
          transport,
          oppref: oppref.trim() || undefined,
        },
      }),
  });

  return (
    <GlassCard className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Test an event payload</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This check runs entirely inside this project. It contacts no provider, writes nothing, and
        cannot create a production conversion.
        {available
          ? ""
          : " A provider validate-only call is not offered because that contract has not been confirmed from authoritative documentation."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Event
          <select
            value={eventName}
            onChange={(changed) => setEventName(changed.target.value)}
            className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground [color-scheme:dark]"
          >
            {OPENAI_ADS_EVENT_CATALOG.map((entry) => (
              <option key={entry.name} value={entry.name} className="bg-popover text-foreground">
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Path
          <select
            value={transport}
            onChange={(changed) => setTransport(changed.target.value as "browser" | "capi")}
            className="mt-1 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground [color-scheme:dark]"
          >
            <option value="browser" className="bg-popover text-foreground">
              Browser pixel
            </option>
            <option value="capi" className="bg-popover text-foreground">
              Server side
            </option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Event id
          <input
            value={eventId}
            onChange={(changed) => setEventId(changed.target.value)}
            placeholder="Shared id used on both paths"
            className="mt-1 w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Ad click reference
          <input
            value={oppref}
            onChange={(changed) => setOppref(changed.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={!eventId.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="mt-4 inline-flex items-center rounded-lg border border-primary/50 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
      >
        {mutation.isPending ? "Checking…" : "Run check"}
      </button>

      {mutation.isError ? (
        <p className="mt-3 text-sm text-destructive">{mutation.error.message}</p>
      ) : null}
      {mutation.data ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{mutation.data.summary}</p>
          <ul className="space-y-2">
            {mutation.data.checks.map((check) => (
              <li key={check.label} className="border-t border-border/50 pt-2">
                <StatePill
                  label={`${check.label}: ${check.outcome}`}
                  tone={
                    check.outcome === "pass"
                      ? "positive"
                      : check.outcome === "warn"
                        ? "warning"
                        : "danger"
                  }
                />
                <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </GlassCard>
  );
}

function OpenAiAdsPage() {
  const read = useServerFn(getOpenAiAdsState);
  const { data } = useSuspenseQuery<OpenAiAdsState>({
    queryKey: ["openai-ads-state"],
    queryFn: () => read({ data: undefined }),
  });

  const activeCount = data.coverage.filter((row) => row.state === "active").length;

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
        <MetricTile
          label="Active events"
          value={`${activeCount} of ${data.coverage.length}`}
          hint="Active means real events were stored"
        />
        <MetricTile label="Last event" value={formatWhen(data.lastEventAt)} hint="UTC" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SurfaceCard title="Browser pixel health" health={data.browser} />
        <SurfaceCard title="Server-side events health" health={data.capi} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Integration and settings</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard className="p-5">
            <h3 className="text-sm font-medium text-foreground">Configuration</h3>
            <dl className="mt-2">
              <DetailRow
                label="Pixel id"
                value={<span className="font-mono text-xs">{data.pixelId}</span>}
              />
              <DetailRow
                label={data.bridge.bridgeSecretName}
                value={
                  <StatePill
                    label={data.bridge.configured ? "configured" : "not configured"}
                    tone={data.bridge.configured ? "positive" : "warning"}
                  />
                }
              />
              <DetailRow
                label={data.bridge.capiSecretName}
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
              Secret values stay server side. Neither secret is ever sent to the browser, and no key
              is ever requested or stored in client-visible code.
            </p>
          </GlassCard>

          <GlassCard className="p-5">
            <h3 className="text-sm font-medium text-foreground">Operational status</h3>
            <dl className="mt-2">
              <DetailRow
                label="Source site connection"
                value={
                  <StatePill
                    label={data.sourceSite.state === "connected" ? "connected" : "not connected"}
                    tone={data.sourceSite.state === "connected" ? "positive" : "warning"}
                  />
                }
              />
              <DetailRow
                label="Attribution reference"
                value={<StatePill label={data.attribution.state} tone="neutral" />}
              />
              <DetailRow
                label="Dedupe health"
                value={`${data.dedup.sharedEventIds} matched, ${data.dedup.browserOnly} browser only, ${data.dedup.capiOnly} server only`}
              />
              <DetailRow
                label="Provider delivery"
                value={
                  <StatePill
                    label={data.delivery.state}
                    tone={
                      data.delivery.state === "clean"
                        ? "positive"
                        : data.delivery.state === "failing"
                          ? "danger"
                          : data.delivery.state === "degraded"
                            ? "warning"
                            : "neutral"
                    }
                  />
                }
              />
            </dl>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              <li>{data.sourceSite.detail}</li>
              <li>{data.attribution.detail}</li>
              <li>{data.delivery.detail}</li>
            </ul>
          </GlassCard>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Event coverage</h2>
        <p className="text-sm text-muted-foreground">
          Active means this project has stored real events of that name. Available means the event
          is recognised and ingestible but no confirmed success boundary is wired. Not applicable
          means the business has no such boundary.
        </p>
        <GlassCard className="p-5">
          <ul className="space-y-4">
            {data.coverage.map((row) => (
              <li
                key={row.name}
                className="border-b border-border/50 pb-4 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {row.label}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{row.name}</span>
                  </p>
                  <StatePill label={row.state} tone={coverageTone(row.state)} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{row.description}</p>
                <p className="mt-1 text-sm text-muted-foreground">{row.stateReason}</p>
                {row.state === "active" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.total} stored · {row.browser} browser · {row.capi} server side · last{" "}
                    {formatWhen(row.lastAt)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Success boundary required: {row.successBoundary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </GlassCard>
        {data.unrecognizedEvents.length > 0 ? (
          <GlassCard className="p-5">
            <h3 className="text-sm font-medium text-foreground">Unrecognised event names</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              These arrived from the instrumented site but are not in the supported catalog:{" "}
              {data.unrecognizedEvents.join(", ")}.
            </p>
          </GlassCard>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Validation</h2>
        <p className="text-sm text-muted-foreground">{data.validation.reason}</p>
        <ValidationControl available={data.validation.providerValidationAvailable} />
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
