import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  BackLink,
  DetailRow,
  GlassCard,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { describeImpact } from "@/lib/impact-words";
import { decideRecommendation } from "@/lib/os-admin.functions";
import { getRecommendation } from "@/lib/os.functions";
import { describeSuggestedAction, isObservationOnly } from "@/lib/recommendation-action";
import { OperatorRouteError } from "@/components/os/route-error";

const recommendationQuery = (id: string) => ({
  queryKey: ["recommendation", id],
  queryFn: () => getRecommendation({ data: { id } }),
});

export const Route = createFileRoute("/recommendations/$id")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(recommendationQuery(params.id));
    if (!data.recommendation) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.recommendation
      ? `${loaderData.recommendation.title} — Recommendations — Marky`
      : "Recommendation — Marky";
    const description =
      loaderData?.recommendation?.description ??
      "Recommendation detail, impact scoring, and reasoning.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(loaderData?.recommendation ? [] : [{ name: "robots", content: "noindex" }]),
      ],
    };
  },
  errorComponent: OperatorRouteError,
  component: RecommendationDetailPage,
});

/**
 * The 2026-08-04 seed migration wrote rows under these source modules with
 * hand-picked confidence and time-saved values ("Enable the research
 * capability" at 85% and 240 minutes, for instance). No rule module writes
 * recommendations under either module today - every rule writer derives its
 * confidence (src/lib/confidence.ts) and stores time_saved_minutes: 0 - so a
 * row from one of these modules is a seeded row, and its scores are estimates
 * someone typed, not measurements.
 */
function seededScores(sourceModule: string | null): boolean {
  return sourceModule === "capabilities" || sourceModule === "knowledge";
}

function RecommendationDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(recommendationQuery(id));
  const queryClient = useQueryClient();
  const decide = useServerFn(decideRecommendation);
  const recommendation = data.recommendation!;
  const decided = recommendation.state === "approved" || recommendation.state === "rejected";
  const observation =
    isObservationOnly(recommendation.metadata) || recommendation.state === "observed";
  const action = describeSuggestedAction(recommendation.suggested_action);
  const canDecide = !decided && !observation && action.executable;

  const mutation = useMutation({
    mutationFn: (decision: "approved" | "rejected") => decide({ data: { id, decision } }),
    onSuccess: (result) => {
      toast.success(`Recommendation ${result.state}`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-10">
      <BackLink to="/recommendations">All observations</BackLink>
      <PageHeader
        eyebrow={observation ? "Observed evidence" : recommendation.source_module}
        title={recommendation.title}
        description={
          recommendation.description ?? "No description recorded for this recommendation."
        }
        actions={
          <>
            <StatePill
              label={observation ? "observation" : recommendation.state}
              tone={observation ? "primary" : toneForState(recommendation.state)}
            />
            {canDecide ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => mutation.mutate("approved")}
                  disabled={mutation.isPending}
                >
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => mutation.mutate("rejected")}
                  disabled={mutation.isPending}
                >
                  Reject
                </Button>
              </>
            ) : action.unavailableReason && !data.changeRequest && !observation ? (
              <p className="max-w-sm text-xs leading-snug text-muted-foreground">
                {action.unavailableReason}
              </p>
            ) : null}
          </>
        }
      />

      {data.changeRequest ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">This is a concrete page change</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The exact before and after values, the evidence, and the approval live on the change
            request for {data.changeRequest.target_url}.
          </p>
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/changes/$id" params={{ id: data.changeRequest.id }}>
                Open the proposed change
              </Link>
            </Button>
          </div>
        </GlassCard>
      ) : null}

      {observation ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">
            This is an observation, not a proposal
          </h2>
          <dl className="mt-3">
            <DetailRow
              label="What this is"
              value="Observed SERP evidence collected from a real provider response."
            />
            <DetailRow
              label="What it means"
              value="A domain or page was seen in results for keywords this workspace tracks, and that sighting is now dated and stored."
            />
            <DetailRow
              label="What it does not mean"
              value="It is not a confirmed business competitor, and no content, workflow, or deployment has been approved."
            />
            <DetailRow
              label="Next real decision"
              value={
                action.link
                  ? "Open the competitor review queue and decide the candidate there."
                  : "None. This row exists so the evidence stays visible; nothing is waiting on you here."
              }
            />
          </dl>
        </GlassCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Impact</h2>
          {seededScores(recommendation.source_module) ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                This row was seeded when the workspace was created. Its impact, risk, confidence and
                time-saved figures were written by hand, not computed from stored evidence, so they
                are not shown as facts.
              </p>
              <dl className="mt-3">
                <DetailRow
                  label="Approval"
                  value={recommendation.requires_approval ? "Required" : "Not required"}
                />
                <DetailRow label="Decided" value={formatWhen(recommendation.approved_at)} />
              </dl>
            </>
          ) : (
            <dl className="mt-3">
              <DetailRow
                label="Traffic impact"
                value={describeImpact(recommendation.traffic_impact)}
              />
              <DetailRow
                label="Revenue impact"
                value={describeImpact(recommendation.revenue_impact)}
              />
              <DetailRow label="Business impact" value={recommendation.business_impact} />
              <DetailRow label="Risk" value={recommendation.risk} />
              <DetailRow
                label="Confidence"
                value={`${Math.round(recommendation.confidence * 100)}%`}
              />
              <DetailRow
                label="Time saved"
                value={`${recommendation.time_saved_minutes} minutes`}
              />
              <DetailRow
                label="Approval"
                value={recommendation.requires_approval ? "Required" : "Not required"}
              />
              <DetailRow label="Decided" value={formatWhen(recommendation.approved_at)} />
            </dl>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Reasoning</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {recommendation.reasoning ?? "No reasoning recorded."}
            </p>
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Suggested action</h2>
            {data.changeRequest ? (
              <p className="mt-2 text-sm text-muted-foreground">
                The decision lives on the linked page-change request above. Approval authorizes the
                exact before/after values there; it does not edit or publish the site.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">{action.summary}</p>
                {action.link ? (
                  <div className="mt-3 space-y-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to={action.link.to}>{action.link.label}</Link>
                    </Button>
                    <p className="text-xs text-muted-foreground">{action.link.effect}</p>
                  </div>
                ) : null}
              </>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Dependencies</h2>
            {data.dependencies.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                This recommendation stands alone.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.dependencies.map((dependency) =>
                  dependency.recommendations ? (
                    <li
                      key={dependency.depends_on_recommendation_id}
                      className="flex items-center justify-between gap-3"
                    >
                      <Link
                        to="/recommendations/$id"
                        params={{ id: dependency.recommendations.id }}
                        className="truncate text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {dependency.recommendations.title}
                      </Link>
                      <StatePill
                        label={dependency.recommendations.state}
                        tone={toneForState(dependency.recommendations.state)}
                      />
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>

      <Link
        to="/recommendations"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        Back to recommendations
      </Link>
    </div>
  );
}
