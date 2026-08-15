import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { GlassCard, PageHeader, StatePill, formatWhen } from "@/components/os/primitives";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getSeoRunProviderBudget,
  parseSeoRunTargets,
  runCreatedSeoBatch,
} from "@/lib/seo-runs/batch";
import {
  isSeoRunEligibleForPreparation,
  isSeoRunEligibleForProposalEventRepair,
} from "@/lib/seo-runs/eligibility";
import {
  createSeoRuns,
  evaluateSeoRun,
  getSeoRuns,
  repairSeoRunProposalEvent,
} from "@/lib/seo-runs/functions";

export const Route = createFileRoute("/seo-runs/")({
  ssr: false,
  head: () => ({ meta: [{ title: "SEO Runs — AOOS" }, { name: "robots", content: "noindex" }] }),
  component: SeoRunsPage,
});

const stages = [
  "Preflight",
  "Evidence",
  "Knowledge",
  "Authority",
  "Proposal",
  "Approval",
  "Execution",
  "Verification",
];

function SeoRunsPage() {
  const loadRuns = useServerFn(getSeoRuns);
  const createRuns = useServerFn(createSeoRuns);
  const evaluateRun = useServerFn(evaluateSeoRun);
  const repairProposalEvent = useServerFn(repairSeoRunProposalEvent);
  const queryClient = useQueryClient();
  const { data: runs } = useSuspenseQuery({ queryKey: ["seo-runs"], queryFn: () => loadRuns() });
  const [targets, setTargets] = useState("");
  const [pendingTargets, setPendingTargets] = useState<string[]>([]);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const startBatch = useMutation({
    mutationFn: async () => {
      const created = await createRuns({
        data: {
          queryClass: "local_service",
          targets: pendingTargets.map((targetUrl) => ({
            targetUrl,
            idempotencyKey: crypto.randomUUID(),
          })),
        },
      });
      return runCreatedSeoBatch(created, (id) => evaluateRun({ data: { id } }));
    },
    onSuccess: async ({ advanced, stopped }) => {
      setBatchResult(
        stopped.length
          ? `${advanced} run${advanced === 1 ? "" : "s"} advanced; ${stopped.length} stopped with a recorded reason.`
          : `${advanced} run${advanced === 1 ? "" : "s"} advanced to the furthest truthful state.`,
      );
      setTargets("");
      setPendingTargets([]);
      setConfirmationOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["seo-runs"] });
    },
    onError: (error) => setInputError(error.message),
  });
  const evaluation = useMutation({
    mutationFn: (id: string) => evaluateRun({ data: { id } }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["seo-runs"] }),
  });
  const proposalEventRepair = useMutation({
    mutationFn: (id: string) => repairProposalEvent({ data: { id } }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["seo-runs"] }),
  });
  const actionableRuns = runs.filter(isSeoRunEligibleForPreparation).slice(0, 10);
  const batchEvaluation = useMutation({
    mutationFn: async () => {
      return runCreatedSeoBatch(actionableRuns, (id) => evaluateRun({ data: { id } }));
    },
    onSuccess: async ({ advanced, stopped }) => {
      setBatchResult(
        stopped.length
          ? `${advanced} run${advanced === 1 ? "" : "s"} advanced; ${stopped.length} stopped with a recorded reason.`
          : `${advanced} run${advanced === 1 ? "" : "s"} advanced to the furthest truthful state.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["seo-runs"] });
    },
  });
  const pendingBudget = pendingTargets.length
    ? getSeoRunProviderBudget(pendingTargets.length)
    : null;
  const resumeBudget = actionableRuns.length
    ? getSeoRunProviderBudget(actionableRuns.length)
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Governed search operations"
        title="SEO Runs"
        description="One visible lifecycle from connector preflight and evidence through a concrete proposal, human approval, execution, and measured verification. Approval never means execution."
      />
      <GlassCard className="p-5">
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {stages.map((stage, index) => (
            <div key={stage} className="rounded-xl border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">{index + 1}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{stage}</p>
            </div>
          ))}
        </div>
      </GlassCard>
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Start real page runs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter one TruMove page URL per line, up to 100. One confirmation creates every run and
          advances the full batch through evidence and proposal preparation. It never approves,
          executes, or publishes a proposal.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const parsed = parseSeoRunTargets(targets);
              setPendingTargets(parsed);
              setInputError(null);
              setConfirmationOpen(true);
            } catch (error) {
              setInputError(error instanceof Error ? error.message : "Enter valid page URLs.");
            }
          }}
        >
          <Textarea
            required
            rows={5}
            value={targets}
            onChange={(event) => setTargets(event.target.value)}
            placeholder={"https://trumoveinc.com/service-page\nhttps://trumoveinc.com/another-page"}
            aria-label="Target page URLs"
          />
          <Button type="submit" variant="outline" disabled={startBatch.isPending}>
            {startBatch.isPending ? "Starting batch…" : "Review and start SEO batch"}
          </Button>
        </form>
        {inputError ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {inputError}
          </p>
        ) : null}
        <AlertDialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Start {pendingBudget?.pages ?? 0} governed SEO run
                {pendingBudget?.pages === 1 ? "" : "s"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This single action creates and advances the entire batch. Maximum external work:{" "}
                {pendingBudget?.geminiEmbeddingRequests ?? 0} Gemini embedding requests,{" "}
                {pendingBudget?.geminiGenerationRequests ?? 0} Gemini generation requests,{" "}
                {pendingBudget?.firecrawlRenders ?? 0} Firecrawl renders, and{" "}
                {pendingBudget?.githubReads ?? 0} GitHub reads. It makes zero new DataForSEO
                requests and never approves, executes, or publishes a proposal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={startBatch.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "outline" })}
                disabled={startBatch.isPending || !pendingBudget}
                onClick={() => startBatch.mutate()}
              >
                {startBatch.isPending ? "Starting…" : "Confirm and start full batch"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </GlassCard>
      {actionableRuns.length ? (
        <GlassCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Prepare a bounded batch</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Advances up to 10 draft, blocked, or failed runs. It never approves, executes, or
                publishes a proposal.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={batchEvaluation.isPending}>
                  {batchEvaluation.isPending
                    ? "Preparing batch…"
                    : `Prepare ${actionableRuns.length} run${actionableRuns.length === 1 ? "" : "s"}`}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm bounded provider work</AlertDialogTitle>
                  <AlertDialogDescription>
                    For {actionableRuns.length} page{actionableRuns.length === 1 ? "" : "s"}, this
                    can make up to {resumeBudget?.geminiEmbeddingRequests ?? 0} Gemini embedding
                    requests, {resumeBudget?.geminiGenerationRequests ?? 0} Gemini generation
                    requests, {resumeBudget?.firecrawlRenders ?? 0} Firecrawl renders, and{" "}
                    {resumeBudget?.githubReads ?? 0} GitHub reads. It makes zero new DataForSEO
                    requests and stops each page honestly if required evidence or a connector is
                    unavailable.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: "outline" })}
                    onClick={() => batchEvaluation.mutate()}
                  >
                    Confirm and prepare
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {batchResult ? <p className="mt-3 text-sm text-muted-foreground">{batchResult}</p> : null}
        </GlassCard>
      ) : null}
      <div className="space-y-3">
        {runs.map((run) => (
          <GlassCard key={run.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link
                  to="/seo-runs/$id"
                  params={{ id: run.id }}
                  className="font-medium text-foreground hover:text-primary"
                >
                  {run.target_url}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {run.query_class} · created {formatWhen(run.created_at)}
                </p>
              </div>
              <StatePill
                label={run.state.replaceAll("_", " ")}
                tone={run.state === "verified" ? "success" : "primary"}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {run.change_request_id
                ? `Concrete proposal linked: ${run.change_request_id}`
                : "No concrete change proposal has been generated."}
            </p>
            {isSeoRunEligibleForPreparation(run) ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={evaluation.isPending}
                  onClick={() => evaluation.mutate(run.id)}
                >
                  Check evidence and prepare proposal
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/seo-runs/$id" params={{ id: run.id }}>
                    Open run
                  </Link>
                </Button>
                <span className="text-xs text-muted-foreground">
                  Runs read-only provider checks and Gemini generation only after preflight passes.
                  It never approves or executes the proposal.
                </span>
              </div>
            ) : null}
            {isSeoRunEligibleForProposalEventRepair(run) ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={proposalEventRepair.isPending}
                  onClick={() => proposalEventRepair.mutate(run.id)}
                >
                  {proposalEventRepair.isPending
                    ? "Repairing timeline…"
                    : "Repair proposal timeline"}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/seo-runs/$id" params={{ id: run.id }}>
                    Open run
                  </Link>
                </Button>
                <span className="text-xs text-muted-foreground">
                  Restores the saved proposal event only. This makes no provider requests.
                </span>
              </div>
            ) : null}
          </GlassCard>
        ))}
        {evaluation.error ? (
          <p className="text-sm text-destructive">{evaluation.error.message}</p>
        ) : null}
        {proposalEventRepair.error ? (
          <p className="text-sm text-destructive">{proposalEventRepair.error.message}</p>
        ) : null}
        {runs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No SEO runs exist for this tenant yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
