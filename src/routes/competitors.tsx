import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
} from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPANY_CLASSIFICATIONS,
  COMPANY_CLASSIFICATION_LABELS,
  type CompanyClassification,
} from "@/lib/company-classification.server";
import {
  decideCompetitorCandidates,
  listCompetitorShortlist,
  updateCompanyClassification,
} from "@/lib/competitors.functions";

const shortlistQuery = {
  queryKey: ["competitor-shortlist"],
  queryFn: () => listCompetitorShortlist(),
};

export const Route = createFileRoute("/competitors")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Competitor review — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "Review the evidence-backed competitor shortlist derived from observed SERPs: keyword overlap, SERP share, head to head positions, and observed page mechanics, before anything becomes tracked.",
      },
      { property: "og:title", content: "Competitor review — AOOS Marketing Operating System" },
      {
        property: "og:description",
        content: "The human gate between competitor discovery and recurring competitor tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompetitorReviewPage,
});

type Row = Awaited<ReturnType<typeof listCompetitorShortlist>>["shortlist"][number];

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function CompetitorReviewPage() {
  const { data } = useSuspenseQuery(shortlistQuery);
  const queryClient = useQueryClient();
  const decide = useServerFn(decideCompetitorCandidates);
  const classify = useServerFn(updateCompanyClassification);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const pending = data.shortlist.filter((row) => row.reviewState === "pending");
  const allSelected = pending.length > 0 && selected.length === pending.length;

  const mutation = useMutation({
    mutationFn: (input: { domains: string[]; decision: "approve" | "reject" }) =>
      decide({ data: input }),
    onSuccess: (result, variables) => {
      toast.success(
        `${result.count} competitor${result.count === 1 ? "" : "s"} ${
          variables.decision === "approve" ? `approved and tracked (${result.tracked})` : "rejected"
        }${result.inboxResolved ? " — inbox item cleared" : ""}`,
      );
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["competitor-shortlist"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const classificationMutation = useMutation({
    mutationFn: (input: { candidateId: string; classification: CompanyClassification }) =>
      classify({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.changed
          ? `${result.domain} is now ${COMPANY_CLASSIFICATION_LABELS[(result.classification ?? "unclassified") as CompanyClassification]}.`
          : `${result.domain} is already ${COMPANY_CLASSIFICATION_LABELS[(result.classification ?? "unclassified") as CompanyClassification]}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["competitor-shortlist"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = mutation.isPending;

  const act = (domains: string[], decision: "approve" | "reject") => {
    if (domains.length === 0) {
      toast.error("Select at least one competitor first.");
      return;
    }
    mutation.mutate({ domains, decision });
  };

  const toggle = (domain: string) =>
    setSelected((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain],
    );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Human approval gate"
        title="Competitor review"
        description="Derived from the stored SERP evidence for approved keywords. Ranking alone is not proof of business competition, so every row carries its own confidence and reasoning. Nothing is tracked until you approve it."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <MetricTile label="SERPs analysed" value={String(data.serpsAnalysed)} />
        <MetricTile label="Shortlisted" value={String(data.shortlist.length)} />
        <MetricTile label="Other observed domains" value={String(data.observed.length)} />
        <MetricTile label="Currently tracked" value={String(data.tracked.length)} />
      </div>

      {data.shortlist.length === 0 ? (
        <EmptyState
          title="No competitor shortlist yet"
          description="Run the competitor intelligence workflow after SERP observation to profile observed domains and propose a shortlist."
        />
      ) : (
        <>
          <GlassCard className="flex flex-wrap items-center gap-2 p-5">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || pending.length === 0}
              onClick={() => setSelected(allSelected ? [] : pending.map((row) => row.domain))}
            >
              {allSelected ? "Clear selection" : "Select all pending"}
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
          </GlassCard>

          <ul className="space-y-2">
            {data.shortlist.map((row) => (
              <CompetitorRow
                key={row.id}
                row={row}
                busy={busy || classificationMutation.isPending}
                checked={selected.includes(row.domain)}
                expanded={expanded === row.id}
                onToggleSelect={() => toggle(row.domain)}
                onToggleExpand={() => setExpanded(expanded === row.id ? null : row.id)}
                onDecide={(decision) => act([row.domain], decision)}
                onClassify={(classification) =>
                  classificationMutation.mutate({ candidateId: row.id, classification })
                }
              />
            ))}
          </ul>
        </>
      )}

      {data.observed.length > 0 ? (
        <GlassCard className="space-y-3 p-5">
          <h2 className="text-sm font-medium text-foreground">Observed but not shortlisted</h2>
          <p className="text-xs text-muted-foreground">
            These domains appear in the evidence but did not clear the significance threshold. They
            stay reviewable and are never tracked automatically.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.observed.slice(0, 60).map((row) => (
              <span key={row.id} className="text-xs text-muted-foreground">
                <span className="text-foreground">{row.domain}</span> · {row.domainClass} ·{" "}
                {row.serpsPresent} SERPs
              </span>
            ))}
          </div>
        </GlassCard>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Approved competitors become tracked competitors and feed recurring observation. Back to the{" "}
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          Action Center
        </Link>
        .
      </p>
    </div>
  );
}
type RowProps = {
  row: Row;
  busy: boolean;
  checked: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onDecide: (decision: "approve" | "reject") => void;
  onClassify: (classification: CompanyClassification) => void;
};

function CompetitorRow({
  row,
  busy,
  checked,
  expanded,
  onToggleSelect,
  onToggleExpand,
  onDecide,
  onClassify,
}: RowProps) {
  const page = row.pageEvidence;
  const classification = (row.companyClassification ?? "unclassified") as CompanyClassification;
  return (
    <li>
      <GlassCard className="space-y-3 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Checkbox
              checked={checked}
              onCheckedChange={onToggleSelect}
              aria-label={`Select ${row.domain}`}
              className="mt-1"
              disabled={row.reviewState !== "pending"}
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">{row.domain}</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatePill
                  label={row.domainClass === "competitor" ? "Business competitor" : "Surface"}
                  tone="primary"
                />
                <StatePill label={`Company: ${COMPANY_CLASSIFICATION_LABELS[classification]}`} />
                <StatePill label={`SERP share ${pct(row.serpShare)}`} />
                <StatePill label={`Median position ${row.medianPosition || "—"}`} />
                <StatePill label={`Outranks us on ${row.outranksOwned}`} />
                <StatePill label={`We outrank on ${row.ownedOutranks}`} />
                <StatePill label={`Confidence ${pct(row.confidence)}`} />
                {row.reviewState === "approved" || row.reviewState === "rejected" ? (
                  <StatePill label={row.reviewState} />
                ) : null}
              </div>
              {row.shortlistReason ? (
                <p className="text-xs text-muted-foreground">{row.shortlistReason}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={classification}
              disabled={busy}
              onValueChange={(value) => onClassify(value as CompanyClassification)}
            >
              <SelectTrigger aria-label={`Classify ${row.domain}`} className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_CLASSIFICATIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {COMPANY_CLASSIFICATION_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={onToggleExpand}>
              {expanded ? "Hide evidence" : "Evidence"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || row.reviewState !== "pending"}
              onClick={() => onDecide("approve")}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || row.reviewState !== "pending"}
              onClick={() => onDecide("reject")}
            >
              Reject
            </Button>
          </div>
        </div>

        {expanded ? (
          <div className="grid gap-4 border-t border-border/60 pt-3 md:grid-cols-2">
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="text-foreground">Ranking evidence</p>
              <p>
                Present in {row.serpsPresent} of {row.serpsAnalysed} observed SERPs. Best position{" "}
                {row.bestPosition || "—"}, average {row.averagePosition || "—"}.
              </p>
              {row.serpFeatures.length > 0 ? (
                <p>Surfaces involved: {row.serpFeatures.join(", ")}</p>
              ) : null}
              {row.confidenceBasis.length > 0 ? (
                <p>Confidence basis: {row.confidenceBasis.join("; ")}</p>
              ) : null}
              {row.keywords.length > 0 ? (
                <p>
                  Overlapping queries: {row.keywords.slice(0, 12).join(", ")}
                  {row.keywords.length > 12 ? "…" : ""}
                </p>
              ) : null}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="text-foreground">Observed page mechanics</p>
              {page && page.fetched ? (
                <>
                  <p>
                    {page.pageType} · intent {page.intentMatch.replace(/_/g, " ")} ·{" "}
                    {page.wordCount.toLocaleString()} words
                  </p>
                  <p>
                    H1 {page.headingCounts.h1} · H2 {page.headingCounts.h2} · H3{" "}
                    {page.headingCounts.h3} · internal links {page.internalLinks} · external{" "}
                    {page.externalLinks}
                  </p>
                  {page.schemaTypes.length > 0 ? (
                    <p>Schema: {page.schemaTypes.join(", ")}</p>
                  ) : null}
                  {page.topicalCoverage.length > 0 ? (
                    <p>Topics covered: {page.topicalCoverage.join(", ")}</p>
                  ) : null}
                  <p>
                    Phone CTA {page.hasPhoneCta ? "yes" : "no"} · quote form{" "}
                    {page.hasQuoteForm ? "yes" : "no"} · review signals{" "}
                    {page.hasReviewSignals ? "yes" : "no"} · FAQ block{" "}
                    {page.hasFaqBlock ? "yes" : "no"}
                  </p>
                  <p className="break-all">Observed page: {page.url}</p>
                </>
              ) : (
                <p>
                  No page observation recorded yet. Run the competitor intelligence workflow to
                  inspect this winner.
                </p>
              )}
            </div>
          </div>
        ) : null}
        {row.classificationUpdatedAt ? (
          <p className="text-xs text-muted-foreground">
            Classification last changed {new Date(row.classificationUpdatedAt).toLocaleString()}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            No business classification has been assigned by an operator.
          </p>
        )}
      </GlassCard>
    </li>
  );
}
