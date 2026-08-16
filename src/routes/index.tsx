import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { memo, useCallback, useMemo } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  GlassCard,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useOperatorSession } from "@/hooks/use-operator-session";
import {
  ACTION_CENTER_PRESENTATION_LANES,
  actionCenterFieldChanges,
  actionCenterLane,
  actionCenterStage,
  type ActionCenterLane,
} from "@/lib/action-center";
import { approveChangeRequest, rejectChangeRequest } from "@/lib/change-requests.functions";
import { executeChangeRequest } from "@/lib/execution/execution.functions";
import { resolveInboxItem } from "@/lib/os-admin.functions";
import { getInbox } from "@/lib/os.functions";

const lanes = ACTION_CENTER_PRESENTATION_LANES;

export const Route = createFileRoute("/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Action Center — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "The operational center of AOOS: everything that needs attention, approval, or awareness across every marketing asset, agent, and workflow.",
      },
      { property: "og:title", content: "Action Center — AOOS Marketing Operating System" },
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
  | { kind: "adsAdvertisers" }
  | { kind: "change"; id: string }
  | { kind: "recommendation"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "workflow"; id: string }
  | { kind: "schedule"; id: string };

// Compiled once at module load. Building this inside the resolver recompiled a
// regex for every inbox row on every render.
const detailHrefPattern =
  /^\/(changes|recommendations|agents|workflows|scheduler)\/([0-9a-fA-F-]{36})$/;

function routeFromHref(href: string): InboxRoute | null {
  if (href === "/keywords") return { kind: "keywords" };
  if (href === "/competitors") return { kind: "competitors" };
  if (href === "/ads/advertisers") return { kind: "adsAdvertisers" };

  const match = href.match(detailHrefPattern);
  if (!match) return null;
  const [, workspace, id] = match;
  if (!id) return null;
  if (workspace === "changes") return { kind: "change", id };
  if (workspace === "recommendations") return { kind: "recommendation", id };
  if (workspace === "agents") return { kind: "agent", id };
  if (workspace === "workflows") return { kind: "workflow", id };
  if (workspace === "scheduler") return { kind: "schedule", id };
  return null;
}

function reviewRouteFor(item: {
  actions: unknown;
  subject_kind: string | null;
  subject_id: string | null;
}): InboxRoute | null {
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
  if (item.subject_kind === "change_request") return { kind: "change", id: item.subject_id };
  if (item.subject_kind === "recommendation")
    return { kind: "recommendation", id: item.subject_id };
  if (item.subject_kind === "agent") return { kind: "agent", id: item.subject_id };
  return null;
}

function InboxLink({ route, children }: { route: InboxRoute; children: React.ReactNode }) {
  const className =
    "text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline";
  if (route.kind === "keywords")
    return (
      <Link to="/keywords" className={className}>
        {children}
      </Link>
    );
  if (route.kind === "competitors")
    return (
      <Link to="/competitors" className={className}>
        {children}
      </Link>
    );
  if (route.kind === "adsAdvertisers")
    return (
      <Link to="/ads/advertisers" className={className}>
        {children}
      </Link>
    );
  if (route.kind === "change")
    return (
      <Link to="/changes/$id" params={{ id: route.id }} className={className}>
        {children}
      </Link>
    );
  if (route.kind === "recommendation")
    return (
      <Link to="/recommendations/$id" params={{ id: route.id }} className={className}>
        {children}
      </Link>
    );
  if (route.kind === "agent")
    return (
      <Link to="/agents/$id" params={{ id: route.id }} className={className}>
        {children}
      </Link>
    );
  if (route.kind === "workflow")
    return (
      <Link to="/workflows/$id" params={{ id: route.id }} className={className}>
        {children}
      </Link>
    );
  return (
    <Link to="/scheduler/$id" params={{ id: route.id }} className={className}>
      {children}
    </Link>
  );
}

function InboxActionLink({ route, children }: { route: InboxRoute; children: React.ReactNode }) {
  if (route.kind === "keywords")
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/keywords">{children}</Link>
      </Button>
    );
  if (route.kind === "competitors")
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/competitors">{children}</Link>
      </Button>
    );
  if (route.kind === "adsAdvertisers")
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/ads/advertisers">{children}</Link>
      </Button>
    );
  if (route.kind === "change")
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/changes/$id" params={{ id: route.id }}>
          {children}
        </Link>
      </Button>
    );
  if (route.kind === "recommendation")
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/recommendations/$id" params={{ id: route.id }}>
          {children}
        </Link>
      </Button>
    );
  if (route.kind === "agent")
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/agents/$id" params={{ id: route.id }}>
          {children}
        </Link>
      </Button>
    );
  if (route.kind === "workflow")
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/workflows/$id" params={{ id: route.id }}>
          {children}
        </Link>
      </Button>
    );
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/scheduler/$id" params={{ id: route.id }}>
        {children}
      </Link>
    </Button>
  );
}

/** Descriptive link text. A button that only says "Open" tells an operator nothing. */
function actionLabel(route: InboxRoute, lane: string): string {
  const pending = lane === "pending_approval";
  switch (route.kind) {
    case "keywords":
      return pending ? "Review keyword candidates" : "Open keyword review";
    case "competitors":
      return pending ? "Review competitor candidates" : "Open competitor review";
    case "adsAdvertisers":
      return pending ? "Review advertiser candidate" : "Open advertiser review";
    case "change":
      return pending ? "Review the proposed change" : "Open the proposed change";
    case "recommendation":
      return pending ? "Review recommendation" : "Open recommendation";
    case "agent":
      return "Open agent detail";
    case "workflow":
      return "Open workflow detail";
    default:
      return "Open schedule detail";
  }
}

function changeActionLabel(change: InboxItem["changeRequest"]): string {
  if (!change) return "Review details";
  if (change.state === "proposed") return "Review full request";
  if (change.state === "approved" && !change.source_commit_sha) return "Review execution details";
  if (change.state === "approved") return "Check publishing status";
  if (change.state === "applied") return "Track outcome";
  return "Review decision record";
}

type InboxItem = Awaited<ReturnType<typeof getInbox>>[number];
type ChangeDecision = "approve" | "ignore";

function ConfirmQuickAction({
  trigger,
  title,
  description,
  confirm,
  disabled,
  onConfirm,
}: {
  trigger: string;
  title: string;
  description: string;
  confirm: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {trigger}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One card per inbox row. Memoized so a mutation toggling the busy flag, or a
 * background refetch returning the same rows, does not re-render every card in
 * every lane.
 */
const InboxCard = memo(function InboxCard({
  item,
  reviewRoute,
  lane,
  busy,
  onClear,
  onDecision,
  onExecute,
}: {
  item: InboxItem;
  reviewRoute: InboxRoute | null;
  lane: ActionCenterLane;
  busy: boolean;
  onClear: (id: string) => void;
  onDecision: (id: string, decision: ChangeDecision) => void;
  onExecute: (id: string) => void;
}) {
  const change = item.changeRequest;
  const fields = actionCenterFieldChanges(change?.changes);

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatePill label={item.source_module} />
          <StatePill label={`P${item.priority}`} tone={item.priority <= 1 ? "danger" : "neutral"} />
          {item.subject_kind ? (
            <StatePill label={item.subject_kind.replaceAll("_", " ")} tone="primary" />
          ) : null}
          <StatePill label={lane.replaceAll("_", " ")} tone={toneForState(lane)} />
          {change ? <StatePill label={actionCenterStage(change)} tone="primary" /> : null}
        </div>

        <div className="space-y-1">
          {reviewRoute ? (
            <InboxLink route={reviewRoute}>{item.title}</InboxLink>
          ) : (
            <p className="text-sm font-medium text-foreground">{item.title}</p>
          )}
          {item.summary ? <p className="text-sm text-muted-foreground">{item.summary}</p> : null}
        </div>

        {change ? (
          <div className="space-y-3 rounded-xl border border-border/60 bg-background/35 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Proposed change
                </p>
                <p className="mt-1 text-sm text-foreground">{change.target_url}</p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <a href={change.target_url} target="_blank" rel="noreferrer">
                  Open page
                </a>
              </Button>
            </div>

            {fields.length > 0 ? (
              <div className="grid gap-2 xl:grid-cols-2">
                {fields.map((field) => (
                  <div
                    key={field.field}
                    className="rounded-lg border border-border/60 bg-card/60 p-3"
                  >
                    <p className="text-xs font-medium text-foreground">{field.label}</p>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                      <div className="rounded-md bg-muted/50 px-2.5 py-2 text-muted-foreground">
                        <span className="mb-1 block text-[10px] uppercase tracking-wide">
                          Before
                        </span>
                        {field.before}
                      </div>
                      <span aria-hidden className="hidden text-muted-foreground sm:block">
                        →
                      </span>
                      <div className="rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2 text-foreground">
                        <span className="mb-1 block text-[10px] uppercase tracking-wide text-primary">
                          After
                        </span>
                        {field.after}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No exact before-and-after values are attached.
              </p>
            )}

            <div className="grid gap-2 text-xs text-muted-foreground lg:grid-cols-2">
              <p>
                <span className="text-foreground">Why:</span> {change.rationale}
              </p>
              <p>
                <span className="text-foreground">Evidence:</span> {change.evidence_summary}
              </p>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">Filed {formatWhen(item.created_at)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/25 px-4 py-3 md:px-5">
        {change?.state === "proposed" ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => onDecision(change.id, "approve")}>
              Approve
            </Button>
            <ConfirmQuickAction
              trigger="Ignore"
              title="Ignore this proposed change?"
              description="This records a rejection and closes the action. It does not change the website."
              confirm="Ignore proposed change"
              disabled={busy}
              onConfirm={() => onDecision(change.id, "ignore")}
            />
          </>
        ) : null}
        {change?.state === "approved" && !change.source_commit_sha ? (
          <ConfirmQuickAction
            trigger="Execute approved change"
            title="Commit this exact approved change?"
            description="AOOS will re-check the stored repository, branch, file, base revision, and exact before values, then commit only the approved replacements. It will not publish the site."
            confirm="Commit approved change"
            disabled={busy}
            onConfirm={() => onExecute(change.id)}
          />
        ) : null}
        {change?.source_commit_url ? (
          <Button asChild variant="outline" size="sm">
            <a href={change.source_commit_url} target="_blank" rel="noreferrer">
              View source commit
            </a>
          </Button>
        ) : null}
        {reviewRoute ? (
          <InboxActionLink route={reviewRoute}>
            {change ? changeActionLabel(change) : actionLabel(reviewRoute, item.lane)}
          </InboxActionLink>
        ) : null}
        {!change && lane !== "pending_approval" ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onClear(item.id)}>
            Clear
          </Button>
        ) : null}
      </div>
    </GlassCard>
  );
});

function InboxPage() {
  const session = useOperatorSession();
  const fetchInbox = useServerFn(getInbox);
  const { data = [] } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => fetchInbox(),
    enabled: session.signedIn,
  });
  const queryClient = useQueryClient();
  const resolve = useServerFn(resolveInboxItem);
  const approve = useServerFn(approveChangeRequest);
  const reject = useServerFn(rejectChangeRequest);
  const execute = useServerFn(executeChangeRequest);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
    void queryClient.invalidateQueries({ queryKey: ["change-request"] });
    void queryClient.invalidateQueries({ queryKey: ["change-request-execution"] });
  };

  const mutation = useMutation({
    mutationFn: (id: string) => resolve({ data: { id } }),
    onSuccess: () => {
      toast.success("Item cleared from Action Center.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decisionMutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: ChangeDecision }) => {
      const payload = {
        id,
        notes: decision === "ignore" ? "Ignored from the Action Center." : null,
        revision: null,
      };
      return decision === "approve" ? approve({ data: payload }) : reject({ data: payload });
    },
    onSuccess: (result, variables) => {
      toast.success(
        result.changed
          ? variables.decision === "approve"
            ? "Approved. The change remains here until it is executed and tracked."
            : "Ignored. No website change was made."
          : "Nothing changed. This request was already decided.",
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => execute({ data: { id } }),
    onSuccess: (result) => {
      if (["committed", "replayed", "reconciled"].includes(result.status))
        toast.success(result.message);
      else toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = mutation.isPending || decisionMutation.isPending || executeMutation.isPending;

  const clear = useCallback((id: string) => mutation.mutate(id), [mutation]);

  // One pass over the rows instead of a full-array filter per lane plus a route
  // resolve per card on every render.
  const { open, grouped } = useMemo(() => {
    const buckets = new Map<
      string,
      { item: InboxItem; reviewRoute: InboxRoute | null; lane: ActionCenterLane }[]
    >();
    for (const lane of lanes) buckets.set(lane.key, []);
    let openCount = 0;
    for (const item of data) {
      const lane = actionCenterLane(item.lane, item.changeRequest);
      const bucket = buckets.get(lane);
      if (!bucket) continue;
      openCount += 1;
      bucket.push({ item, reviewRoute: reviewRouteFor(item), lane });
    }
    return { open: openCount, grouped: buckets };
  }, [data]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Operational center"
        title="Action Center"
        description={`${open} open actions across every workspace. Each card shows what is being requested and the decisions you can take now.`}
      />

      <div className="space-y-6">
        {lanes.map((lane) => {
          const items = grouped.get(lane.key) ?? [];
          return (
            <section key={lane.key} className="space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  {lane.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {items.length}
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">{lane.hint}</p>
              </div>

              {items.length === 0 ? (
                <EmptyState
                  title="Nothing here"
                  description={`No ${lane.label.toLowerCase()} items right now.`}
                />
              ) : (
                <ul className="space-y-2">
                  {items.map(({ item, reviewRoute, lane: itemLane }) => (
                    <li key={item.id}>
                      <InboxCard
                        item={item}
                        reviewRoute={reviewRoute}
                        lane={itemLane}
                        busy={busy}
                        onClear={clear}
                        onDecision={(id, decision) => decisionMutation.mutate({ id, decision })}
                        onExecute={(id) => executeMutation.mutate(id)}
                      />
                    </li>
                  ))}
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
