import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
} from "@/components/os/primitives";
import { formatWhen } from "@/lib/format-when";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { runKeywordEnrichment } from "@/lib/dataforseo.functions";
import {
  ENRICHMENT_BATCH_CAP,
  estimatedEnrichmentCostUsd,
} from "@/lib/dataforseo/keyword-enrichment.server";
import { decideKeywordCandidates, listKeywordCandidates } from "@/lib/keywords.functions";
import { OperatorRouteError } from "@/components/os/route-error";

const candidatesQuery = {
  queryKey: ["keyword-candidates", "all"],
  queryFn: () => listKeywordCandidates({ data: { reviewState: "all" as const } }),
};

type ReviewFilter = "pending" | "approved" | "rejected" | "all";

const REVIEW_FILTERS: ReadonlyArray<{ key: ReviewFilter; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export const Route = createFileRoute("/keywords")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Keyword approval · Marky" },
      {
        name: "description",
        content:
          "Review DataForSEO Labs keyword candidates with volume, CPC, competition, and provenance, then approve or reject each one before SERP observation runs.",
      },
      { property: "og:title", content: "Keyword approval · Marky" },
      {
        property: "og:description",
        content: "The human gate between keyword discovery and paid SERP observation.",
      },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: KeywordReviewPage,
});

type Metrics = {
  search_volume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  keyword_difficulty?: number | null;
  search_intent?: string | null;
  competitor?: string | null;
};

function readMetrics(value: unknown): Metrics {
  return (value ?? {}) as Metrics;
}

function fmtNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "not reported";
}

function fmtMoney(value: number | null | undefined): string {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "not reported";
}

function KeywordReviewPage() {
  const { data } = useSuspenseQuery(candidatesQuery);
  const queryClient = useQueryClient();
  const decide = useServerFn(decideKeywordCandidates);
  const enrich = useServerFn(runKeywordEnrichment);
  const [selected, setSelected] = useState<string[]>([]);

  const allCandidates = data.candidates;

  // The page used to ask only for pending candidates, so an operator who had
  // already approved everything saw an empty screen with forty approved
  // keywords hidden one filter away.
  const counts = useMemo(
    () => ({
      pending: allCandidates.filter((row) => row.review_state === "pending").length,
      approved: allCandidates.filter((row) => row.review_state === "approved").length,
      rejected: allCandidates.filter((row) => row.review_state === "rejected").length,
      all: allCandidates.length,
    }),
    [allCandidates],
  );

  const [filter, setFilter] = useState<ReviewFilter>(() =>
    data.pendingCount > 0 ? "pending" : "all",
  );

  const candidates = useMemo(
    () =>
      filter === "all" ? allCandidates : allCandidates.filter((row) => row.review_state === filter),
    [allCandidates, filter],
  );

  const allSelected = candidates.length > 0 && selected.length === candidates.length;

  const totalVolume = useMemo(
    () => candidates.reduce((sum, row) => sum + (readMetrics(row.metrics).search_volume ?? 0), 0),
    [candidates],
  );

  const mutation = useMutation({
    mutationFn: (input: { keywords: string[]; decision: "approve" | "reject" }) =>
      decide({ data: input }),
    onSuccess: (result, variables) => {
      toast.success(
        `${result.count} keyword${result.count === 1 ? "" : "s"} ${variables.decision === "approve" ? "approved" : "rejected"}${
          result.inboxResolved ? ", inbox item cleared" : ""
        }`,
      );
      if (result.folded > 0) {
        toast.success(
          `${result.folded} were other ways of spelling something you already target, so they were not added again.`,
        );
      }
      if (result.metricsNotStored > 0) {
        toast.error(
          `${result.metricsNotStored} keyword${result.metricsNotStored === 1 ? "" : "s"} kept no record of what it was worth. The database is missing the columns that hold it.`,
        );
      }
      // The decision now runs the targeting pass, so the operator is told what
      // it produced rather than being left to wonder whether anything happened.
      if (result.targeting.ran) {
        toast.success(
          result.targeting.recommendations > 0
            ? `Targeting pass: ${result.targeting.recommendations} suggestion${result.targeting.recommendations === 1 ? "" : "s"} from your approved set`
            : "Targeting pass ran and raised nothing new",
        );
      } else if (result.count > 0) {
        toast.error(
          `Your decision was saved, and the targeting pass did not run: ${result.targeting.reason}`,
        );
      }
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["keyword-candidates"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const enrichMutation = useMutation({
    mutationFn: () => enrich(),
    onSuccess: (result) => {
      const capped = result.pendingTotal > result.sentThisRun;
      toast.success(
        `${
          capped
            ? `Scored ${result.sentThisRun} of ${result.pendingTotal} pending. Run again for the rest`
            : `${result.enriched} keyword${result.enriched === 1 ? "" : "s"} scored`
        }${
          result.unparsed > 0
            ? ` (${result.unparsed} items skipped: unrecognized response shape)`
            : ""
        }.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["keyword-candidates"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = mutation.isPending;

  const act = (keywords: string[], decision: "approve" | "reject") => {
    if (keywords.length === 0) {
      toast.error("Select at least one keyword first.");
      return;
    }
    mutation.mutate({ keywords, decision });
  };

  const toggle = (keyword: string) =>
    setSelected((prev) =>
      prev.includes(keyword) ? prev.filter((k) => k !== keyword) : [...prev, keyword],
    );

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Decide"
        title="Keywords"
        description="Search terms worth winning. Candidates were proposed from seeds you already approved, and nothing is tracked or looked up until you approve it."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile label="Pending candidates" value={String(data.pendingCount)} />
        <MetricTile label="Selected" value={String(selected.length)} />
        <MetricTile label="Combined monthly volume" value={fmtNumber(totalVolume)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {REVIEW_FILTERS.map((option) => (
          <Button
            key={option.key}
            variant="outline"
            size="sm"
            aria-pressed={filter === option.key}
            className={filter === option.key ? "border-primary/60 text-primary" : undefined}
            onClick={() => {
              setFilter(option.key);
              setSelected([]);
            }}
          >
            {option.label} ({counts[option.key]})
          </Button>
        ))}
      </div>

      {candidates.length === 0 ? (
        <EmptyState
          title={
            counts.all === 0
              ? "No keyword candidates yet"
              : `No ${filter === "all" ? "" : filter} keyword candidates`
          }
          description={
            counts.all === 0
              ? "Keyword discovery has never proposed a candidate for this tenant. Run the DataForSEO Labs discovery workflow to fill this list."
              : "Nothing sits in this state right now. Switch filters above to see the rest."
          }
        />
      ) : (
        <>
          <GlassCard className="flex flex-wrap items-center gap-2 p-5">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setSelected(allSelected ? [] : candidates.map((row) => row.keyword))}
            >
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => act(selected, "approve")}
            >
              Approve selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => act(selected, "reject")}
            >
              Reject selected
            </Button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border/70" />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                act(
                  candidates.map((row) => row.keyword),
                  "approve",
                )
              }
            >
              Approve all
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                act(
                  candidates.map((row) => row.keyword),
                  "reject",
                )
              }
            >
              Reject all
            </Button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border/70" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={enrichMutation.isPending || counts.pending === 0}
              onClick={() => enrichMutation.mutate()}
              aria-describedby="enrich-cost"
            >
              {enrichMutation.isPending ? "Scoring…" : "Score how hard these are to win"}
            </Button>
          </GlassCard>
          <p id="enrich-cost" className="text-xs text-muted-foreground">
            Costs about ${estimatedEnrichmentCostUsd().toFixed(2)}, two paid look-ups covering up to{" "}
            {ENRICHMENT_BATCH_CAP.toLocaleString()} keywords waiting for a decision at a time; the
            rest run on the next click. Nothing is spent until you click, and no keyword is approved
            by it.
          </p>

          <ul className="space-y-2">
            {candidates.map((row) => {
              const metrics = readMetrics(row.metrics);
              const checked = selected.includes(row.keyword);
              return (
                <li key={row.id}>
                  <GlassCard className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(row.keyword)}
                        aria-label={`Select ${row.keyword}`}
                        className="mt-1"
                      />
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium text-foreground">{row.keyword}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatePill
                            label={`Volume ${fmtNumber(metrics.search_volume)}`}
                            tone="primary"
                          />
                          <StatePill label={`CPC ${fmtMoney(metrics.cpc)}`} />
                          <StatePill
                            label={`Competition ${
                              typeof metrics.competition === "number"
                                ? metrics.competition.toFixed(2)
                                : "not reported"
                            }`}
                          />
                          <StatePill
                            label={`How hard to win ${fmtNumber(metrics.keyword_difficulty)}`}
                          />
                          <StatePill
                            label={
                              metrics.search_intent
                                ? `What they want ${metrics.search_intent}`
                                : "Intent not reported"
                            }
                          />
                          <StatePill label={row.source} />
                          {row.seed ? <StatePill label={`Seed: ${row.seed}`} /> : null}
                        </div>
                        {metrics.competitor ? (
                          <p className="text-xs text-muted-foreground">
                            Found because {metrics.competitor} ranks for it and this site does not.
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {row.language_code}-{row.location_code} · snapshot{" "}
                          {row.snapshot_id ? row.snapshot_id.slice(0, 8) : "none"} · proposed{" "}
                          {formatWhen(row.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => act([row.keyword], "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => act([row.keyword], "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </GlassCard>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Approved keywords become tracked keywords and unblock SERP observation. Back to the{" "}
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          Action Center
        </Link>
        .
      </p>
    </div>
  );
}
