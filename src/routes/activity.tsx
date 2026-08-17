import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

import {
  EmptyState,
  GlassCard,
  PageHeader,
  PageStack,
  StatePill,
  Timeline,
  TimelineItem,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import type { ActivityEvent, ActivityStage } from "@/lib/activity.functions";
import { listActivityFeed } from "@/lib/activity.functions";

const activityQuery = {
  queryKey: ["activity-feed"],
  queryFn: () => listActivityFeed(),
};

const STAGE_LABEL: Record<ActivityStage, string> = {
  suggested: "Suggested",
  decided: "Decided",
  run: "Run",
  deployed: "Deployed",
  measured: "Measuring",
};

export const Route = createFileRoute("/activity")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Activity feed — AOOS" },
      {
        name: "description",
        content:
          "Every suggestion followed end to end: the change it became, the runs that carried it, the deployment events, and the measurement window that follows.",
      },
      { property: "og:title", content: "Activity feed — AOOS" },
      {
        property: "og:description",
        content: "Suggestion to decision to run to deployment to measurement, in one trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityPage,
});

function EventRow({ event }: { event: ActivityEvent }) {
  const body = (
    <>
      <span className="mr-2 rounded-full border border-border/60 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] text-muted-foreground">
        {STAGE_LABEL[event.stage]}
      </span>
      {event.detail}
    </>
  );

  return (
    <TimelineItem
      title={
        event.linkTo && event.linkId ? (
          <Link
            to={event.linkTo}
            params={{ id: event.linkId }}
            className="underline-offset-4 hover:underline"
          >
            {event.title}
          </Link>
        ) : (
          event.title
        )
      }
      meta={formatWhen(event.at)}
      tone={toneForState(event.state)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span>{body}</span>
        {event.externalUrl ? (
          <a
            href={event.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            Open commit <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
    </TimelineItem>
  );
}

function ActivityPage() {
  const { data } = useSuspenseQuery(activityQuery);

  return (
    <PageStack>
      <PageHeader
        eyebrow="Run work"
        title="Activity feed"
        description="Follow one suggestion the whole way: what proposed it, who decided it, which runs carried it, what was deployed, and when its outcome can be read."
      />

      {data.threads.length === 0 ? (
        <EmptyState
          title="No suggestion has reached a change yet"
          description="Generate a page change from stored evidence so the trail has something to follow."
        />
      ) : (
        <div className="space-y-4">
          {data.threads.map((thread) => (
            <GlassCard key={thread.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/changes/$id"
                      params={{ id: thread.id }}
                      className="text-base font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {thread.title}
                    </Link>
                    <StatePill label={thread.state} tone={toneForState(thread.state)} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {thread.targetUrl} · started {formatWhen(thread.startedAt)} · last event{" "}
                    {formatWhen(thread.lastEventAt)}
                  </p>
                  <p className="mt-2 text-sm text-primary">{thread.instruction}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  {thread.actionTo === "/changes/$id" ? (
                    <Link to="/changes/$id" params={{ id: thread.id }}>
                      {thread.actionLabel}
                    </Link>
                  ) : (
                    <Link to={thread.actionTo}>{thread.actionLabel}</Link>
                  )}
                </Button>
              </div>

              <Timeline className="mt-4">
                {thread.events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </Timeline>
            </GlassCard>
          ))}
        </div>
      )}

      {data.orphanSuggestions.length > 0 ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-medium text-foreground">
            Suggestions with no change yet
          </h2>
          <p className="mt-1 text-sm text-primary">
            Turn one of these into a concrete page change so it can be approved and deployed.
          </p>
          <ul className="mt-3 space-y-2">
            {data.orphanSuggestions.map((suggestion) => (
              <li
                key={suggestion.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-b-0 last:pb-0"
              >
                <Link
                  to="/recommendations/$id"
                  params={{ id: suggestion.id }}
                  className="text-sm text-foreground underline-offset-4 hover:underline"
                >
                  {suggestion.title}
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatWhen(suggestion.createdAt)}
                  <StatePill label={suggestion.state} tone={toneForState(suggestion.state)} />
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </PageStack>
  );
}
