import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, GlassCard, MetricTile, PageHeader, StatePill, formatWhen } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { decideKeywordCandidates, listKeywordCandidates } from "@/lib/keywords.functions";

const candidatesQuery = {
  queryKey: ["keyword-candidates", "pending"],
  queryFn: () => listKeywordCandidates({ data: { reviewState: "pending" as const } }),
};

export const Route = createFileRoute("/keywords")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Keyword approval — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "Review DataForSEO Labs keyword candidates with volume, CPC, competition, and provenance, then approve or reject each one before SERP observation runs.",
      },
      { property: "og:title", content: "Keyword approval — AOOS Marketing Operating System" },
      {
        property: "og:description",
        content: "The human gate between keyword discovery and paid SERP observation.",
      },
    ],
  }),
  component: KeywordReviewPage,
});

type Metrics = { search_volume?: number | null; cpc?: number | null; competition?: number | null };

function readMetrics(value: unknown): Metrics {
  return (value ?? {}) as Metrics;
}

function fmtNumber(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

function fmtMoney(value: number | null | undefined): string {
  return typeof value === "number" ? `$${value.toFixed(2)}` : "—";
}

function KeywordReviewPage() {
  const { data } = useSuspenseQuery(candidatesQuery);
  const queryClient = useQueryClient();
  const decide = useServerFn(decideKeywordCandidates);
  const [selected, setSelected] = useState<string[]>([]);

  const candidates = data.candidates;
  const allSelected = candidates.length > 0 && selected.length === candidates.length;

  const totalVolume = useMemo(
    () => candidates.reduce((sum, row) => sum + (readMetrics(row.metrics).search_volume ?? 0), 0),
    [candidates],
  );

  const mutation = useMutation({
    mutationFn: (input: { keywords: string[]; decision: "approve" | "reject" }) => decide({ data: input }),
    onSuccess: (result, variables) => {
      toast.success(
        `${result.count} keyword${result.count === 1 ? "" : "s"} ${variables.decision === "approve" ? "approved" : "rejected"}${
          result.inboxResolved ? " — inbox item cleared" : ""
        }`,
      );
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["keyword-candidates"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
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
    setSelected((prev) => (prev.includes(keyword) ? prev.filter((k) => k !== keyword) : [...prev, keyword]));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Human approval gate"
        title="Keyword approval"
        description="DataForSEO Labs proposed these from operator-approved seeds. Nothing reaches SERP observation until you approve it."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricTile label="Pending candidates" value={String(data.pendingCount)} />
        <MetricTile label="Selected" value={String(selected.length)} />
        <MetricTile label="Combined monthly volume" value={fmtNumber(totalVolume)} />
      </div>

      {candidates.length === 0 ? (
        <EmptyState
          title="No pending keyword candidates"
          description="Every proposed keyword has been reviewed. Run keyword discovery again to propose more."
        />
      ) : (
        <>
          <GlassCard className="flex flex-wrap items-center gap-2 p-4">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setSelected(allSelected ? [] : candidates.map((row) => row.keyword))}
            >
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => act(selected, "approve")}>
              Approve selected
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => act(selected, "reject")}>
              Reject selected
            </Button>
            <span aria-hidden className="mx-1 h-5 w-px bg-border/70" />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => act(candidates.map((row) => row.keyword), "approve")}
            >
              Approve all
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => act(candidates.map((row) => row.keyword), "reject")}
            >
              Reject all
            </Button>
          </GlassCard>

          <ul className="space-y-2">
            {candidates.map((row) => {
              const metrics = readMetrics(row.metrics);
              const checked = selected.includes(row.keyword);
              return (
                <li key={row.id}>
                  <GlassCard className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
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
                          <StatePill label={`Volume ${fmtNumber(metrics.search_volume)}`} tone="primary" />
                          <StatePill label={`CPC ${fmtMoney(metrics.cpc)}`} />
                          <StatePill
                            label={`Competition ${
                              typeof metrics.competition === "number" ? metrics.competition.toFixed(2) : "—"
                            }`}
                          />
                          <StatePill label={row.source} />
                          {row.seed ? <StatePill label={`Seed: ${row.seed}`} /> : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {row.language_code}-{row.location_code} · snapshot {row.snapshot_id ? row.snapshot_id.slice(0, 8) : "none"} ·
                          proposed {formatWhen(row.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => act([row.keyword], "approve")}>
                        Approve
                      </Button>
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => act([row.keyword], "reject")}>
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
          Inbox
        </Link>
        .
      </p>
    </div>
  );
}
