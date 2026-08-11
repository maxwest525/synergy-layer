import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { EmptyState, GlassCard, PageHeader, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { getRecommendations } from "@/lib/os.functions";

const recommendationsQuery = { queryKey: ["recommendations"], queryFn: () => getRecommendations() };

export const Route = createFileRoute("/recommendations/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  loader: ({ context }) => {
    // Warm the cache without blocking navigation; the suspense boundary
    // renders the pending surface immediately.
    void context.queryClient.prefetchQuery(recommendationsQuery);
  },
  head: () => ({
    meta: [
      { title: "Recommendation Queue — AOOS" },
      {
        name: "description",
        content:
          "Scored recommendations with traffic, revenue, and business impact, confidence, risk, and time saved before approval.",
      },
      { property: "og:title", content: "Recommendation Queue — AOOS" },
      { property: "og:description", content: "What the system thinks should happen next, and why." },
    ],
  }),
  component: RecommendationsPage,
});

function RecommendationsPage() {
  const { data } = useSuspenseQuery(recommendationsQuery);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="What to do next"
        title="Recommendation Queue"
        description="Every proposal carries impact, confidence, risk, and reasoning. Nothing is applied without an explicit decision."
      />

      {data.length === 0 ? (
        <EmptyState title="Queue is clear" description="No open recommendations right now." />
      ) : (
        <ul className="space-y-3">
          {data.map((recommendation) => (
            <li key={recommendation.id}>
              <Link to="/recommendations/$id" params={{ id: recommendation.id }} className="block">
                <GlassCard className="p-5 transition-colors hover:border-primary/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{recommendation.title}</p>
                      {recommendation.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {recommendation.description}
                        </p>
                      ) : null}
                    </div>
                    <StatePill label={recommendation.state} tone={toneForState(recommendation.state)} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatePill label={`traffic: ${recommendation.traffic_impact}`} />
                    <StatePill label={`revenue: ${recommendation.revenue_impact}`} />
                    <StatePill label={`business: ${recommendation.business_impact}`} />
                    <StatePill
                      label={`risk: ${recommendation.risk}`}
                      tone={recommendation.risk === "high" || recommendation.risk === "critical" ? "danger" : "neutral"}
                    />
                    <StatePill label={`confidence: ${Math.round(recommendation.confidence * 100)}%`} tone="primary" />
                    <span className="text-xs text-muted-foreground">
                      {recommendation.time_saved_minutes} min saved · filed {formatWhen(recommendation.created_at)}
                    </span>
                  </div>
                </GlassCard>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
