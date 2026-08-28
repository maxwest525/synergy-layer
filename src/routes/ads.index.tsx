import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  CardGrid,
  DetailRow,
  EmptyState,
  formatWhen,
  GlassCard,
  MetricTile,
  PageHeader,
  PageStack,
  Section,
  StatePill,
  toneForState,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { RoutePending } from "@/components/os/route-pending";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  checkAdsProviderGate,
  decideAdvertiserCandidate,
  getAdsOverview,
  runAdsCanary,
  runAdvertiserSweep,
  type AdsCandidateView,
} from "@/lib/ads.functions";

export const Route = createFileRoute("/ads/")({
  // Operator-only surface. Rendering it on the server without the operator
  // bearer token yields an empty tree the client immediately replaces.
  ssr: false,
  errorComponent: OperatorRouteError,
  pendingComponent: RoutePending,
  head: () => ({
    meta: [
      { title: "Competitor ads — Marky" },
      {
        name: "description",
        content:
          "See which competitors are running Google ads right now, what those ads say, and confirm which advertiser accounts belong to which competitor.",
      },
      { property: "og:title", content: "Competitor ads — Marky" },
      {
        property: "og:description",
        content: "Competitor ads observed in Google's public ad library, with what they say.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CompetitorAdsPage,
});

function confidenceLabel(value: number | null): string {
  if (value === null) return "not scored";
  return `${Math.round(value * 100)}% likely the same company`;
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
            Found while checking {candidate.domain} · advertiser account {candidate.advertiserId}
          </p>
        </div>
        <StatePill label={candidate.reviewState} tone={toneForState(candidate.reviewState)} />
      </div>

      <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <DetailRow label="Match" value={confidenceLabel(candidate.confidence)} />
        <DetailRow label="Ads found" value={String(candidate.creativesObserved)} />
        <DetailRow
          label="Sends traffic to that domain"
          value={candidate.servesQueriedDomain ? "yes" : "not seen"}
        />
        <DetailRow label="Checked" value={formatWhen(candidate.createdAt)} />
        <DetailRow
          label="Landing domains"
          value={
            candidate.targetDomains.length > 0 ? candidate.targetDomains.join(", ") : "none seen"
          }
        />
        <DetailRow label="Paid for by" value={candidate.adFundedBy ?? "not disclosed"} />
      </div>

      {pending ? (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Confirming links this advertiser account to the competitor. It does not spend anything
            and does not change your website.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onDecide("confirm")}>
              Yes, this is them
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onDecide("reject")}>
              Not them
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Detail an operator rarely needs, kept out of the way but never hidden. */
function Advanced({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function CompetitorAdsPage() {
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
          `Lookup service reachable on ${status.planName ?? "unnamed plan"} with ${status.searchesLeft ?? "unknown"} lookups left.`,
        );
      } else {
        toast.error(status.error ?? "Lookup service check failed.");
      }
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decideMutation = useMutation({
    mutationFn: (input: { candidateId: string; decision: "confirm" | "reject" }) =>
      decide({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.pending === 0
          ? "Saved. Nothing else is waiting on you here."
          : `Saved. ${result.pending} more still waiting on you.`,
      );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canaryMutation = useMutation({
    mutationFn: () => canary({ data: { domain: canaryDomain } }),
    onSuccess: (result) => {
      if (!result.ran) {
        toast.error(result.blocked ?? "The lookup did not run.");
      } else {
        toast.success(
          `Done: ${result.chargedCredits} lookup used, ${result.candidatesFiled} advertiser${result.candidatesFiled === 1 ? "" : "s"} to review.`,
        );
      }
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sweepMutation = useMutation({
    mutationFn: () => sweep({ data: { limit: 12 } }),
    onSuccess: (result) => {
      if (result.domainsSearched === 0) {
        // Nothing searched has two very different causes and they were being
        // reported with the same red toast. `domainsAttempted === 0` means the
        // sweep found nothing left to do -- every competitor on the list is
        // already resolved -- which is a finished state, not a failure. It read
        // as an error, and an operator seeing "No competitor was checked" on a
        // fully-resolved list has no way to tell success from breakage.
        if (result.domainsAttempted === 0) {
          toast.success(
            "Every competitor on your list has already been checked. Add one to check something new.",
          );
        } else {
          toast.error(
            result.stoppedEarly ??
              "The lookup service did not check any competitor, and gave no reason.",
          );
        }
      } else {
        toast.success(
          `Checked ${result.domainsSearched} competitor${result.domainsSearched === 1 ? "" : "s"}, found ${result.candidatesFiled} to review, used ${result.chargedCredits} lookup${result.chargedCredits === 1 ? "" : "s"}.`,
        );
        if (result.stoppedEarly) toast.warning(`Stopped early: ${result.stoppedEarly}`);
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

  const advertiserById = new Map(data.advertisers.map((row) => [row.id, row]));
  const creativesByAdvertiser = new Map<string, typeof data.creatives>();
  for (const creative of data.creatives) {
    const list = creativesByAdvertiser.get(creative.advertiserFk) ?? [];
    list.push(creative);
    creativesByAdvertiser.set(creative.advertiserFk, list);
  }

  const lookupsLeft = account.searchesLeft;

  return (
    <PageStack>
      <PageHeader
        eyebrow="Evidence"
        title="Competitor ads"
        description="Ads your competitors are running right now, read from Google's public ad library. The library itself is free. The service that reads it for us charges one lookup per competitor checked."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => gateMutation.mutate()}
            >
              Check lookups left (free)
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={busy}>
                  Check all watched competitors
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>This uses one lookup per competitor</AlertDialogTitle>
                  <AlertDialogDescription>
                    Up to twelve watched competitors are checked, using at most one lookup each. It
                    only runs while the lookup service is reachable and has lookups left. Anything
                    found is filed for you to review. Nothing is confirmed automatically and your
                    website is not touched.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => sweepMutation.mutate()}>
                    Check them now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <CardGrid columns={4}>
        <MetricTile
          label="Waiting on you"
          value={pendingCandidates.length}
          hint="Advertiser accounts to confirm"
        />
        <MetricTile
          label="Competitors watched"
          value={data.watchlist.filter((row) => row.active).length}
          hint={`${data.watchlist.length} on the list`}
        />
        <MetricTile label="Ads collected" value={data.creatives.length} hint="Stored ad copy" />
        <MetricTile
          label="Lookups left"
          value={lookupsLeft === null ? "Unknown" : lookupsLeft}
          hint={
            account.configured
              ? account.valid
                ? `Plan ${account.planName ?? "unnamed"}`
                : "Lookup service not reachable"
              : "Never checked"
          }
        />
      </CardGrid>

      {pendingCandidates.length > 0 ? (
        <Section
          title="Waiting on you"
          hint="Is this advertiser account the competitor we think it is?"
        >
          <div className="space-y-3">
            {pendingCandidates.map((candidate) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                busy={busy}
                onDecide={(decision) =>
                  decideMutation.mutate({ candidateId: candidate.id, decision })
                }
              />
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="What they're running" hint="Ad copy collected from the public ad library">
        {data.creatives.length === 0 ? (
          <EmptyState
            title="No competitor ads collected yet"
            description="Ads appear here after a competitor is checked and their advertiser account is confirmed. Use Check all watched competitors above to start."
          />
        ) : (
          <div className="space-y-4">
            {[...creativesByAdvertiser.entries()].map(([advertiserFk, list]) => {
              const advertiser = advertiserById.get(advertiserFk);
              return (
                <GlassCard key={advertiserFk} className="p-5">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">
                      {advertiser?.advertiserName ?? "Unlinked advertiser"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {advertiser?.linkedDomains.length
                        ? advertiser.linkedDomains.join(", ")
                        : (advertiser?.vendorDomain ?? "no competitor linked yet")}{" "}
                      · {list.length} ad{list.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="divide-y divide-border/50">
                    {list.map((creative) => (
                      <div key={creative.id} className="py-3">
                        <p className="text-sm text-foreground">
                          {creative.headline ?? "No headline recorded"}
                        </p>
                        {creative.snippet ? (
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {creative.snippet}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {creative.format ?? "unknown format"}
                          {creative.callToAction ? ` · button: ${creative.callToAction}` : ""}
                          {creative.targetDomain ? ` · sends to ${creative.targetDomain}` : ""}
                          {creative.lastShown
                            ? ` · last seen ${formatWhen(creative.lastShown)}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Who we're watching" hint="Competitor domains checked for ads">
        {data.watchlist.length === 0 ? (
          <EmptyState
            title="No competitors on the watch list"
            description="Competitor domains are added from the Competitors workspace, then checked for ads here."
          />
        ) : (
          <GlassCard className="p-5">
            <div className="divide-y divide-border/50">
              {data.watchlist.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{row.domain}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.label ?? "no label"} · {row.linkedAdvertisers} confirmed advertiser
                      {row.linkedAdvertisers === 1 ? "" : "s"}
                      {row.active ? "" : " · not being checked"}
                    </p>
                  </div>
                  <StatePill
                    label={row.resolutionState.replace(/_/g, " ")}
                    tone={toneForState(row.resolutionState)}
                  />
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </Section>

      <Section title="Behind the scenes" hint="Only needed when something looks wrong">
        <GlassCard className="space-y-5 p-5">
          <Advanced title="Lookup service status">
            <div className="grid gap-1 text-sm sm:grid-cols-2">
              <DetailRow
                label="Status"
                value={
                  <StatePill
                    label={
                      account.configured ? (account.valid ? "reachable" : "unusable") : "unchecked"
                    }
                    tone={account.configured ? (account.valid ? "positive" : "danger") : "neutral"}
                  />
                }
              />
              <DetailRow label="Plan" value={account.planName ?? "unknown"} />
              <DetailRow
                label="Lookups left"
                value={account.searchesLeft === null ? "unknown" : String(account.searchesLeft)}
              />
              <DetailRow
                label="Hourly limit"
                value={account.hourlyLimit === null ? "unknown" : String(account.hourlyLimit)}
              />
              <DetailRow
                label="Used this hour"
                value={
                  account.thisHourSearches === null ? "unknown" : String(account.thisHourSearches)
                }
              />
              <DetailRow
                label="Last checked"
                value={account.checkedAt ? formatWhen(account.checkedAt) : "never"}
              />
            </div>
            {account.error ? (
              <p className="mt-3 text-sm text-destructive">{account.error}</p>
            ) : null}
            <div className="mt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={busy}>
                    Test one lookup on {canaryDomain}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>This uses one lookup</AlertDialogTitle>
                    <AlertDialogDescription>
                      One ad library search is made for {canaryDomain}. It only runs when the lookup
                      service is reachable and reports at least ten lookups remaining. Anything
                      found is filed for you to review.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => canaryMutation.mutate()}>
                      Run the test
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Advanced>

          <Advanced title={`Lookup history (${data.ledger.length})`}>
            {data.ledger.length === 0 ? (
              <p className="text-xs text-muted-foreground">No lookup has been made yet.</p>
            ) : (
              <div className="divide-y divide-border/50">
                {data.ledger.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {row.queryText ?? row.engine}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatWhen(row.startedAt)} · {row.chargedCredits} lookup used
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
          </Advanced>

          <Advanced title={`Past decisions (${decidedCandidates.length})`}>
            {decidedCandidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing has been decided yet.</p>
            ) : (
              <div className="space-y-3">
                {decidedCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    busy={busy}
                    onDecide={() => undefined}
                  />
                ))}
              </div>
            )}
          </Advanced>
        </GlassCard>
      </Section>
    </PageStack>
  );
}
