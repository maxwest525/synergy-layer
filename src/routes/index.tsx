import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { EmptyState, GlassCard, PageHeader, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { resolveInboxItem } from "@/lib/os-admin.functions";
import { getInbox } from "@/lib/os.functions";

const inboxQuery = {
  queryKey: ["inbox"],
  queryFn: () => getInbox(),
};

const lanes = [
  { key: "needs_attention", label: "Needs attention", hint: "Broken, blocked, or drifting." },
  { key: "pending_approval", label: "Pending approval", hint: "Waiting on a human decision." },
  { key: "scheduled", label: "Scheduled", hint: "Queued to run." },
  { key: "completed", label: "Completed", hint: "Closed in the last cycle." },
  { key: "fyi", label: "FYI", hint: "Context, no action needed." },
] as const;

export const Route = createFileRoute("/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  // A transient data failure must not turn SSR into a 500 blank screen; the
  // client-side suspense query retries and surfaces the error in the boundary.
  loader: ({ context }) => context.queryClient.ensureQueryData(inboxQuery).catch(() => undefined),
  head: () => ({
    meta: [
      { title: "Inbox — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "The operational center of AOOS: everything that needs attention, approval, or awareness across every marketing asset, agent, and workflow.",
      },
      { property: "og:title", content: "Inbox — AOOS Marketing Operating System" },
      {
        property: "og:description",
        content: "One queue for every decision the marketing operating system needs from you.",
      },
    ],
  }),
  component: InboxPage,
});

/**
 * Some inbox items are decisions with a real review surface behind them. An
 * item the operator cannot open is a gate nobody can pass.
 */
type InboxRoute =
  | { kind: "keywords" }
  | { kind: "competitors" }
  | { kind: "recommendation"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "workflow"; id: string }
  | { kind: "schedule"; id: string };

const idPattern = "[0-9a-fA-F-]{36}";

function routeFromHref(href: string): InboxRoute | null {
  if (href === "/keywords") return { kind: "keywords" };
  if (href === "/competitors") return { kind: "competitors" };

  const match = href.match(new RegExp(`^/(recommendations|agents|workflows|scheduler)/(${idPattern})$`));
  if (!match) return null;
  const [, workspace, id] = match;
  if (!id) return null;
  if (workspace === "recommendations") return { kind: "recommendation", id };
  if (workspace === "agents") return { kind: "agent", id };
  if (workspace === "workflows") return { kind: "workflow", id };
  if (workspace === "scheduler") return { kind: "schedule", id };
  return null;
}

function reviewRouteFor(item: { actions: unknown; subject_kind: string | null; subject_id: string | null }): InboxRoute | null {
  if (Array.isArray(item.actions)) {
    for (const action of item.actions) {
      if (typeof action !== "object" || action === null) continue;
      const href = (action as Record<string, unknown>)["href"];
      if (typeof href !== "string") continue;
      const route = routeFromHref(href);
      if (route) return route;
    }
  }

  if (!item.subject_id) return null;
  if (item.subject_kind === "recommendation") return { kind: "recommendation", id: item.subject_id };
  if (item.subject_kind === "agent") return { kind: "agent", id: item.subject_id };
  return null;
}

function InboxLink({ route, children }: { route: InboxRoute; children: React.ReactNode }) {
  const className = "text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline";
  if (route.kind === "keywords") return <Link to="/keywords" className={className}>{children}</Link>;
  if (route.kind === "competitors") return <Link to="/competitors" className={className}>{children}</Link>;
  if (route.kind === "recommendation") return <Link to="/recommendations/$id" params={{ id: route.id }} className={className}>{children}</Link>;
  if (route.kind === "agent") return <Link to="/agents/$id" params={{ id: route.id }} className={className}>{children}</Link>;
  if (route.kind === "workflow") return <Link to="/workflows/$id" params={{ id: route.id }} className={className}>{children}</Link>;
  return <Link to="/scheduler/$id" params={{ id: route.id }} className={className}>{children}</Link>;
}

function InboxPage() {

  const { data } = useSuspenseQuery(inboxQuery);
  const queryClient = useQueryClient();
  const resolve = useServerFn(resolveInboxItem);

  const mutation = useMutation({
    mutationFn: (id: string) => resolve({ data: { id } }),
    onSuccess: () => {
      toast.success("Item cleared");
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const open = data.filter((item) => item.lane !== "completed" && item.resolved_at === null).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operational center"
        title="Inbox"
        description={`${open} open items across every workspace. Work flows here first, then out to the module that owns it.`}
      />

      <div className="space-y-6">
        {lanes.map((lane) => {
          const items = data.filter((item) => item.lane === lane.key);
          return (
            <section key={lane.key} className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  {lane.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{items.length}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{lane.hint}</p>
              </div>

              {items.length === 0 ? (
                <EmptyState title="Nothing here" description={`No ${lane.label.toLowerCase()} items right now.`} />
              ) : (
                <ul className="space-y-2">
                  {items.map((item) => {
                    const reviewRoute = reviewRouteFor(item);
                    return (
                    <li key={item.id}>
                      <GlassCard className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatePill label={item.source_module} />
                            <StatePill label={`P${item.priority}`} tone={item.priority <= 1 ? "danger" : "neutral"} />
                            {item.subject_kind ? <StatePill label={item.subject_kind} tone="primary" /> : null}
                          </div>
                          {reviewRoute ? (
                            <InboxLink route={reviewRoute}>{item.title}</InboxLink>
                          ) : (
                            <p className="text-sm font-medium text-foreground">{item.title}</p>
                          )}
                          {item.summary ? (
                            <p className="text-sm text-muted-foreground">{item.summary}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">Filed {formatWhen(item.created_at)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatePill label={item.lane} tone={toneForState(item.lane)} />
                          {reviewRoute ? (
                            <Button asChild variant="outline" size="sm">
                              <InboxLink route={reviewRoute}>{item.lane === "pending_approval" ? "Review" : "Open"}</InboxLink>
                            </Button>
                          ) : null}
                          {item.lane !== "completed" && item.lane !== "pending_approval" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={mutation.isPending}
                              onClick={() => mutation.mutate(item.id)}
                            >
                              Clear
                            </Button>
                          ) : null}
                        </div>
                      </GlassCard>
                    </li>
                    );
                  })}

                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Looking for system-wide state? Open the{" "}
        <Link to="/command-center" className="text-primary underline-offset-4 hover:underline">
          Command Center
        </Link>
        .
      </p>
    </div>
  );
}
