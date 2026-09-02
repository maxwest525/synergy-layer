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
import { formatWhen } from "@/lib/format-when";
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
  reviewOwnershipCandidate,
  updateCompanyClassification,
} from "@/lib/competitors.functions";
import { DOMAIN_ANALYTICS_CONFIG } from "@/lib/dataforseo/domain-analytics.server";
import {
  OWNERSHIP_REVIEW_STATE_LABELS,
  OWNERSHIP_RULE_LABELS,
  describeMatchedFields,
  type OwnershipReviewDecision,
} from "@/lib/dataforseo/ownership-review";
import { estimatedGapCostUsd } from "@/lib/dataforseo/keyword-gap.server";
import { estimatedIntersectCostUsd } from "@/lib/dataforseo/link-intersect";
import {
  runCompetitorKeywordGap,
  runCompetitorLinkIntersect,
  runWhoisForKnownDomains,
} from "@/lib/dataforseo.functions";
import { OperatorRouteError } from "@/components/os/route-error";

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
      { title: "Competitor review · Marky" },
      {
        name: "description",
        content:
          "Review the evidence-backed competitor shortlist derived from observed SERPs: keyword overlap, SERP share, head to head positions, and observed page mechanics, before anything becomes tracked.",
      },
      { property: "og:title", content: "Competitor review · Marky" },
      {
        property: "og:description",
        content: "The human gate between competitor discovery and recurring competitor tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: OperatorRouteError,
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
  const runGap = useServerFn(runCompetitorKeywordGap);
  const runIntersect = useServerFn(runCompetitorLinkIntersect);
  const runWhois = useServerFn(runWhoisForKnownDomains);
  const reviewOwnership = useServerFn(reviewOwnershipCandidate);
  const trackedCount = data.tracked.filter((row) => row.active).length;
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">(() =>
    data.shortlist.some((row) => row.reviewState === "pending") ? "pending" : "all",
  );

  const pending = data.shortlist.filter((row) => row.reviewState === "pending");
  const counts = {
    pending: pending.length,
    approved: data.shortlist.filter((row) => row.reviewState === "approved").length,
    rejected: data.shortlist.filter((row) => row.reviewState === "rejected").length,
    all: data.shortlist.length,
  };
  const visible =
    filter === "all" ? data.shortlist : data.shortlist.filter((row) => row.reviewState === filter);
  const allSelected = pending.length > 0 && selected.length === pending.length;

  const mutation = useMutation({
    mutationFn: (input: { domains: string[]; decision: "approve" | "reject" }) =>
      decide({ data: input }),
    onSuccess: (result, variables) => {
      toast.success(
        `${result.count} competitor${result.count === 1 ? "" : "s"} ${
          variables.decision === "approve" ? `approved and tracked (${result.tracked})` : "rejected"
        }${result.inboxResolved ? ", inbox item cleared" : ""}`,
      );
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ["competitor-shortlist"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const gapMutation = useMutation({
    mutationFn: () => runGap(),
    onSuccess: (result) => {
      toast.success(
        `${result.filed} searches filed for approval from ${result.competitors} competitors${
          result.unparsed > 0
            ? ` (${result.unparsed} items skipped: unrecognized response shape)`
            : ""
        }.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["keyword-candidates"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const intersectMutation = useMutation({
    mutationFn: () => runIntersect(),
    onSuccess: (result) => {
      toast.success(
        result.created
          ? `${result.rows} site(s) link to every one of ${result.competitors} tracked competitor(s) and not to you.`
          : "Today's comparison already existed; nothing was spent.",
      );
      void queryClient.invalidateQueries({ queryKey: ["competitor-shortlist"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const whoisMutation = useMutation({
    mutationFn: () => runWhois(),
    onSuccess: (result) => {
      toast.success(
        result.created
          ? `${result.rows} registration record(s) read across ${result.domains} known domain(s); ${result.candidatesFiled} ownership candidate(s) filed for your decision.`
          : "Today's registration read already existed; nothing was spent.",
      );
      void queryClient.invalidateQueries({ queryKey: ["competitor-shortlist"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ownershipMutation = useMutation({
    mutationFn: (input: { id: string; decision: OwnershipReviewDecision }) =>
      reviewOwnership({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.reviewState === "confirmed"
          ? "Recorded as one owner. Nothing else changes on its own."
          : "Recorded as separate owners.",
      );
      void queryClient.invalidateQueries({ queryKey: ["competitor-shortlist"] });
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
    <div className="space-y-10">
      <PageHeader
        eyebrow="Decide"
        title="Competitors"
        description="Derived from the stored SERP evidence for approved keywords. Ranking alone is not proof of business competition, so every row carries its own confidence and reasoning. Nothing is tracked until you approve it."
        actions={
          trackedCount > 0 ? (
            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                size="sm"
                disabled={gapMutation.isPending}
                onClick={() => gapMutation.mutate()}
                aria-describedby="gap-cost"
              >
                {gapMutation.isPending ? "Comparing…" : "Find searches they win and you miss"}
              </Button>
              <p id="gap-cost" className="text-xs text-muted-foreground">
                Costs about ${estimatedGapCostUsd(trackedCount).toFixed(2)}, one paid look-up per
                approved competitor. Nothing is spent until you click, and every search it finds
                arrives in the keyword queue for approval before anything tracks it.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={intersectMutation.isPending}
                onClick={() => intersectMutation.mutate()}
                aria-describedby="intersect-cost"
              >
                {intersectMutation.isPending ? "Comparing…" : "Compare linking sites"}
              </Button>
              <p id="intersect-cost" className="text-xs text-muted-foreground">
                Costs about ${estimatedIntersectCostUsd().toFixed(2)}, one paid look-up across every
                approved competitor. It stores which sites link to all of them and not to you; it
                files nothing and tracks nothing.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={whoisMutation.isPending}
                onClick={() => whoisMutation.mutate()}
                aria-describedby="whois-cost"
              >
                {whoisMutation.isPending ? "Reading…" : "Read registration records"}
              </Button>
              <p id="whois-cost" className="text-xs text-muted-foreground">
                Costs about ${DOMAIN_ANALYTICS_CONFIG.estimatedUsdPerRequest.toFixed(2)}, one paid
                look-up across every tracked and reviewed competitor domain. Two domains sharing a
                registration detail are filed below as a question for you; nothing is asserted on
                its own.
              </p>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <MetricTile label="SERPs analysed" value={String(data.serpsAnalysed)} />
        <MetricTile label="Shortlisted" value={String(data.shortlist.length)} />
        <MetricTile label="Other observed domains" value={String(data.observed.length)} />
        <MetricTile label="Currently tracked" value={String(data.tracked.length)} />
      </div>

      {data.whoisRead || data.ownershipCandidates.length > 0 ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Who owns which domain</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.whoisRead
              ? `Registration records read ${formatWhen(data.whoisRead.collectedAt)}: ${data.whoisRead.records} record(s) across ${data.whoisRead.domains.length} known domain(s).`
              : "No registration record has been read yet."}{" "}
            A match below is a question, not a finding: only your decision records an owner.
          </p>
          {data.ownershipCandidates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No two known domains share a stored registration detail or technology stack.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.ownershipCandidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex flex-col gap-1.5 border-b border-border/50 pb-3 text-sm last:border-b-0"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-foreground">
                      {candidate.domainA} and {candidate.domainB}
                    </span>
                    <StatePill
                      label={
                        OWNERSHIP_REVIEW_STATE_LABELS[candidate.reviewState] ??
                        candidate.reviewState
                      }
                      tone={candidate.reviewState === "pending" ? "warning" : "neutral"}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {OWNERSHIP_RULE_LABELS[candidate.rule] ?? candidate.rule}:{" "}
                    {describeMatchedFields(candidate.matchedFields)}. Filed{" "}
                    {formatWhen(candidate.createdAt)}.
                  </span>
                  {candidate.reviewState === "pending" ? (
                    <span className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={ownershipMutation.isPending}
                        onClick={() =>
                          ownershipMutation.mutate({ id: candidate.id, decision: "confirmed" })
                        }
                      >
                        Same owner
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={ownershipMutation.isPending}
                        onClick={() =>
                          ownershipMutation.mutate({ id: candidate.id, decision: "rejected" })
                        }
                      >
                        Separate owners
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      ) : null}

      {data.linkIntersect ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">
            Sites linking to every tracked competitor and not to you
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Read {formatWhen(data.linkIntersect.collectedAt)} across{" "}
            {data.linkIntersect.competitors.join(", ")}.
            {data.linkIntersect.possiblyTruncated
              ? " The read filled its limit, so the list is cut off rather than complete."
              : ""}
            {data.linkIntersect.unparsed > 0
              ? ` ${data.linkIntersect.unparsed} item(s) skipped: unrecognized response shape.`
              : ""}
          </p>
          {data.linkIntersect.rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No site links to all {data.linkIntersect.competitors.length} of them without linking
              to you.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.linkIntersect.rows.slice(0, 50).map((row) => (
                <li
                  key={row.domain}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 text-sm last:border-b-0"
                >
                  <span className="text-foreground">{row.domain}</span>
                  <span className="text-xs text-muted-foreground">
                    {Object.entries(row.byCompetitor)
                      .map(([competitor, entry]) => `${entry.backlinks} link(s) to ${competitor}`)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      ) : null}

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

          <div className="flex flex-wrap items-center gap-2">
            {(["pending", "approved", "rejected", "all"] as const).map((key) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                aria-pressed={filter === key}
                className={filter === key ? "border-primary/60 text-primary" : undefined}
                onClick={() => setFilter(key)}
              >
                {key === "all" ? "All" : key[0]!.toUpperCase() + key.slice(1)} ({counts[key]})
              </Button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title={`No ${filter} competitors`}
              description="Nothing sits in this state right now. Switch filters above to see the rest of the shortlist."
            />
          ) : null}

          <ul className="space-y-2">
            {visible.map((row) => (
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
                  label={row.domainClass === "competitor" ? "Ranks alongside you" : "Web platform"}
                  tone="primary"
                />
                <StatePill label={`Company: ${COMPANY_CLASSIFICATION_LABELS[classification]}`} />
                <StatePill label={`SERP share ${pct(row.serpShare)}`} />
                <StatePill
                  label={
                    row.medianPosition
                      ? `Median position ${row.medianPosition}`
                      : "Median position not observed"
                  }
                />
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
                {row.bestPosition || "not observed"}, average{" "}
                {row.averagePosition || "not observed"}.
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
