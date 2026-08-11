import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  DetailRow,
  EmptyState,
  formatWhen,
  GlassCard,
  MetricTile,
  PageHeader,
  StatePill,
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
import {
  checkAdsProviderGate,
  decideAdvertiserCandidate,
  getAdsOverview,
  runAdsCanary,
  runAdvertiserSweep,

  type AdsCandidateView,
} from "@/lib/ads.functions";

export const Route = createFileRoute("/ads/advertisers")({

  // Operator-only surface. Rendering it on the server without the operator
  // bearer token yields an empty tree the client immediately replaces.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Google advertiser review — AOOS Marketing Operating System" },
      {
        name: "description",
        content:
          "Confirm or reject the Google advertiser accounts observed running ads for watched vendor domains, with provider quota, spend ledger, and stored evidence in view.",
      },
      { property: "og:title", content: "Google advertiser review — AOOS Marketing Operating System" },
      {
        property: "og:description",
        content: "The human gate between observed Google Ads Transparency evidence and a confirmed advertiser.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdvertiserReviewPage,
});

/** GlassCard with the standard titled chrome this workspace uses throughout. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <GlassCard className="p-5">
      <div className="mb-4 space-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </GlassCard>
  );
}

function confidenceLabel(value: number | null): string {
  if (value === null) return "unscored";
  return `${Math.round(value * 100)}% match confidence`;
}

function CandidateCard({
  candidate,
  busy,
  onDecide,
}: {
  candidate: AdsCandidateView;
  busy: boolean;
  onDecide: (decision: "confirm" | "reject") => void;
}) {
  const pending = candidate.reviewState === "pending";
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {candidate.advertiserName ?? candidate.advertiserId}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Advertiser ID {candidate.advertiserId} · observed for {candidate.domain}
          </p>
        </div>
        <StatePill label={candidate.reviewState} tone={toneForState(candidate.reviewState)} />
      </div>

      <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <DetailRow label="Confidence" value={confidenceLabel(candidate.confidence)} />
        <DetailRow label="Creatives observed" value={String(candidate.creativesObserved)} />
        <DetailRow
          label="Serves the queried domain"
          value={candidate.servesQueriedDomain ? "yes" : "not observed"}
        />
        <DetailRow label="Observed" value={formatWhen(candidate.createdAt)} />
        <DetailRow
          label="Target domains"
          value={candidate.targetDomains.length > 0 ? candidate.targetDomains.join(", ") : "none recorded"}
        />
        <DetailRow label="Funded by" value={candidate.adFundedBy ?? "not reported"} />
      </div>

      {pending ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onDecide("confirm")}>
            Confirm advertiser
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onDecide("reject")}>
            Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AdvertiserReviewPage() {
  const loadOverview = useServerFn(getAdsOverview);
  const { data } = useSuspenseQuery({
    queryKey: ["ads-overview"],
    queryFn: () => loadOverview(),
  });
  const queryClient = useQueryClient();
  const gate = useServerFn(checkAdsProviderGate);
  const decide = useServerFn(decideAdvertiserCandidate);
  const canary = useServerFn(runAdsCanary);
  const sweep = useServerFn(runAdvertiserSweep);

  const [canaryDomain] = useState("budgetvanlines.com");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["ads-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const gateMutation = useMutation({
    mutationFn: () => gate(),
    onSuccess: (status) => {
      if (status.valid) {
        toast.success(
          `SerpApi reachable on ${status.planName ?? "unnamed plan"} with ${status.searchesLeft ?? "unknown"} searches left.`,
        );
      } else {
        toast.error(status.error ?? "SerpApi account check failed.");
      }
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decideMutation = useMutation({
    mutationFn: (input: { candidateId: string; decision: "confirm" | "reject" }) => decide({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.pending === 0
          ? "Decision recorded. No advertiser candidates remain, so the inbox item is cleared."
          : `Decision recorded. ${result.pending} candidate${result.pending === 1 ? "" : "s"} still awaiting review.`,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canaryMutation = useMutation({
    mutationFn: () => canary({ data: { domain: canaryDomain } }),
    onSuccess: (result) => {
      if (!result.ran) {
        toast.error(result.blocked ?? "The canary did not run.");
      } else {
        toast.success(
          `Canary complete: ${result.chargedCredits} credit charged, ${result.candidatesFiled} candidate${result.candidatesFiled === 1 ? "" : "s"} filed for review.`,
        );
      }
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unresolvedDomains = data.watchlist.filter(
    (row) => row.active && row.resolutionState === "unresolved",
  ).length;

  const sweepMutation = useMutation({
    mutationFn: () => sweep({ data: { limit: 12 } }),
    onSuccess: (result) => {
      if (result.domainsSearched === 0) {
        toast.error(result.stoppedEarly ?? "No vendor domain was searched.");
      } else {
        toast.success(
          `Sweep complete: ${result.domainsSearched} domain${result.domainsSearched === 1 ? "" : "s"} searched, ${result.candidatesFiled} candidate${result.candidatesFiled === 1 ? "" : "s"} filed, ${result.chargedCredits} credit${result.chargedCredits === 1 ? "" : "s"} charged.`,
        );
        if (result.stoppedEarly) toast.warning(`Sweep stopped early: ${result.stoppedEarly}`);
      }
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy =
    gateMutation.isPending ||
    decideMutation.isPending ||
    canaryMutation.isPending ||
    sweepMutation.isPending;

  const pendingCandidates = data.candidates.filter((row) => row.reviewState === "pending");
  const decidedCandidates = data.candidates.filter((row) => row.reviewState !== "pending");
  const { account } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Google Ads Transparency"
        title="Lead vendor advertiser review"
        description="Every advertiser account observed in the Google Ads Transparency Center stays a candidate until an operator confirms it. A vendor may run several advertiser accounts, so confirming links rather than replaces."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Awaiting decision" value={String(pendingCandidates.length)} />
        <MetricTile label="Confirmed advertisers" value={String(data.advertisers.length)} />
        <MetricTile label="Watched vendor domains" value={String(data.watchlist.length)} />
        <MetricTile
          label="Credits charged"
          value={String(data.ledger.reduce((sum, row) => sum + row.chargedCredits, 0))}
        />
      </div>

      <Section title="Provider account" description="Quota facts only. The API key is never read, returned, or stored.">
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          <DetailRow
            label="Status"
            value={
              <StatePill
                label={account.configured ? (account.valid ? "reachable" : "unusable") : "unchecked"}
                tone={account.configured ? (account.valid ? "positive" : "danger") : "neutral"}
              />
            }
          />
          <DetailRow label="Plan" value={account.planName ?? "unknown"} />
          <DetailRow label="Searches left" value={account.searchesLeft === null ? "unknown" : String(account.searchesLeft)} />
          <DetailRow label="Hourly limit" value={account.hourlyLimit === null ? "unknown" : String(account.hourlyLimit)} />
          <DetailRow label="Used this hour" value={account.thisHourSearches === null ? "unknown" : String(account.thisHourSearches)} />
          <DetailRow label="Last checked" value={account.checkedAt ? formatWhen(account.checkedAt) : "never"} />
        </div>
        {account.error ? <p className="mt-3 text-sm text-destructive">{account.error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => gateMutation.mutate()}>
            Run free account check
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy}>
                Run one metered canary for {canaryDomain}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>This may charge one SerpApi search credit</AlertDialogTitle>
                <AlertDialogDescription>
                  Running the canary makes at most one Ads Transparency search for {canaryDomain}. It may
                  charge one SerpApi search credit against this account, and it only runs when the account
                  is valid and reports at least ten searches remaining. Any advertiser it finds is filed as
                  a pending candidate; nothing is confirmed automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => canaryMutation.mutate()}>
                  Spend one credit and run
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy || unresolvedDomains === 0}>
                Sweep {unresolvedDomains} unresolved vendor domain{unresolvedDomains === 1 ? "" : "s"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  This may charge up to {unresolvedDomains} SerpApi search credits
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The sweep runs one Ads Transparency search per unresolved vendor domain, one at a time,
                  through the same metered path as the canary. It refuses to start a search when the
                  account is invalid or below the ten search floor, and it stops at the first refusal.
                  Every advertiser it finds is filed as a pending candidate; nothing is confirmed
                  automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => sweepMutation.mutate()}>
                  Spend credits and sweep
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          The account check costs nothing. The canary buys at most one search, and only when the account is valid
          and reports at least ten searches remaining.
        </p>
      </Section>

      <Section
        title={`Candidates awaiting decision (${pendingCandidates.length})`}
        description="Nothing is auto-confirmed. Each attribution of an advertiser account to a vendor is an operator judgement."
      >
        {pendingCandidates.length === 0 ? (
          <EmptyState
            title="No advertiser candidate is waiting"
            description="Run the free account check, then the canary, to collect the first Ads Transparency evidence."
          />
        ) : (
          <div className="space-y-3">
            {pendingCandidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                busy={busy}
                onDecide={(decision) => decideMutation.mutate({ candidateId: candidate.id, decision })}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Vendor watchlist" description="Watched domains and how far advertiser resolution has progressed.">
        {data.watchlist.length === 0 ? (
          <EmptyState title="No watched vendor domains" description="Add vendor domains to begin advertiser resolution." />
        ) : (
          <div className="divide-y divide-border/50">
            {data.watchlist.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{row.domain}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.label ?? "no label"} · {row.linkedAdvertisers} linked advertiser
                    {row.linkedAdvertisers === 1 ? "" : "s"}
                    {row.active ? "" : " · inactive"}
                  </p>
                </div>
                <StatePill label={row.resolutionState.replace(/_/g, " ")} tone={toneForState(row.resolutionState)} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Confirmed advertisers" description="Operator-confirmed advertiser accounts and the vendor domains they are linked to.">
        {data.advertisers.length === 0 ? (
          <EmptyState
            title="No confirmed advertiser yet"
            description="Confirm a candidate above to create the first advertiser record."
          />
        ) : (
          <div className="divide-y divide-border/50">
            {data.advertisers.map((row) => (
              <div key={row.id} className="py-3">
                <p className="text-sm text-foreground">{row.advertiserName ?? row.advertiserId}</p>
                <p className="text-xs text-muted-foreground">
                  ID {row.advertiserId} · confirmed {formatWhen(row.confirmedAt)} ·{" "}
                  {row.linkedDomains.length > 0 ? row.linkedDomains.join(", ") : row.vendorDomain ?? "unlinked"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Provider request ledger"
        description="Append-only record of every SerpApi call: what was reserved, what was actually charged, and what the provider returned."
      >
        {data.ledger.length === 0 ? (
          <EmptyState title="No provider calls recorded" description="No SerpApi search has been made for this workspace." />
        ) : (
          <div className="divide-y divide-border/50">
            {data.ledger.map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {row.module} · {row.queryText ?? row.engine}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatWhen(row.startedAt)} · reserved {row.reservedCredits} · charged {row.chargedCredits}
                    {row.providerSearchId ? ` · provider ${row.providerSearchId}` : ""}
                    {row.durationMs === null ? "" : ` · ${row.durationMs} ms`}
                  </p>
                  {row.failureReason ? (
                    <p className="mt-1 text-xs text-destructive">{row.failureReason}</p>
                  ) : null}
                </div>
                <StatePill label={row.state} tone={toneForState(row.state)} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {decidedCandidates.length > 0 ? (
        <Section title="Decided candidates" description="The audit trail of past advertiser attribution decisions.">
          <div className="space-y-3">
            {decidedCandidates.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} busy={busy} onDecide={() => undefined} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
