import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { DetailRow, GlassCard, PageHeader, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { decideRecommendation } from "@/lib/os-admin.functions";
import { getRecommendation } from "@/lib/os.functions";

const recommendationQuery = (id: string) => ({
  queryKey: ["recommendation", id],
  queryFn: () => getRecommendation({ data: { id } }),
});

export const Route = createFileRoute("/recommendations/$id")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(recommendationQuery(params.id));
    if (!data.recommendation) throw notFound();
    return data;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.recommendation
      ? `${loaderData.recommendation.title} — Recommendations — AOOS`
      : "Recommendation — AOOS";
    const description =
      loaderData?.recommendation?.description ?? "Recommendation detail, impact scoring, and reasoning.";
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
  component: RecommendationDetailPage,
});

function RecommendationDetailPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(recommendationQuery(id));
  const queryClient = useQueryClient();
  const decide = useServerFn(decideRecommendation);
  const recommendation = data.recommendation!;
  const decided = recommendation.state === "approved" || recommendation.state === "rejected";

  const mutation = useMutation({
    mutationFn: (decision: "approved" | "rejected") => decide({ data: { id, decision } }),
    onSuccess: (result) => {
      toast.success(`Recommendation ${result.state}`);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={recommendation.source_module}
        title={recommendation.title}
        description={recommendation.description ?? "No description recorded for this recommendation."}
        actions={
          <>
            <StatePill label={recommendation.state} tone={toneForState(recommendation.state)} />
            {!decided ? (
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
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Impact</h2>
          <dl className="mt-3">
            <DetailRow label="Traffic impact" value={recommendation.traffic_impact} />
            <DetailRow label="Revenue impact" value={recommendation.revenue_impact} />
            <DetailRow label="Business impact" value={recommendation.business_impact} />
            <DetailRow label="Risk" value={recommendation.risk} />
            <DetailRow label="Confidence" value={`${Math.round(recommendation.confidence * 100)}%`} />
            <DetailRow label="Time saved" value={`${recommendation.time_saved_minutes} minutes`} />
            <DetailRow label="Approval" value={recommendation.requires_approval ? "Required" : "Not required"} />
            <DetailRow label="Decided" value={formatWhen(recommendation.approved_at)} />
          </dl>
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
            <pre className="mt-2 overflow-x-auto rounded-xl border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
              {JSON.stringify(recommendation.suggested_action, null, 2)}
            </pre>
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-foreground">Dependencies</h2>
            {data.dependencies.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">This recommendation stands alone.</p>
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

      <Link to="/recommendations" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to recommendations
      </Link>
    </div>
  );
}
