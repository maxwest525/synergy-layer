import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { GlassCard, PageHeader, StatePill, formatWhen } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSeoRun, evaluateSeoRun, getSeoRuns } from "@/lib/seo-runs/functions";

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
  const createRun = useServerFn(createSeoRun);
  const evaluateRun = useServerFn(evaluateSeoRun);
  const queryClient = useQueryClient();
  const { data: runs } = useSuspenseQuery({ queryKey: ["seo-runs"], queryFn: () => loadRuns() });
  const [targetUrl, setTargetUrl] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      createRun({
        data: { targetUrl, queryClass: "local_service", idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: async () => {
      setTargetUrl("");
      await queryClient.invalidateQueries({ queryKey: ["seo-runs"] });
    },
  });
  const evaluation = useMutation({
    mutationFn: (id: string) => evaluateRun({ data: { id } }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["seo-runs"] }),
  });

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
        <h2 className="text-sm font-semibold text-foreground">Start a real page run</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This creates only a draft record. It does not call a provider, create a proposal, approve,
          or publish anything.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Input
            type="url"
            required
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="https://example.com/service-page"
            aria-label="Target page URL"
          />
          <Button type="submit" disabled={mutation.isPending}>
            Create draft run
          </Button>
        </form>
        {mutation.error ? (
          <p className="mt-3 text-sm text-destructive">{mutation.error.message}</p>
        ) : null}
      </GlassCard>
      <div className="space-y-3">
        {runs.map((run) => (
          <GlassCard key={run.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-foreground">{run.target_url}</p>
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
            {run.state === "draft" || run.state === "preflight_blocked" ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={evaluation.isPending}
                  onClick={() => evaluation.mutate(run.id)}
                >
                  Check evidence and prepare proposal
                </Button>
                <span className="text-xs text-muted-foreground">
                  Runs read-only provider checks and Gemini generation only after preflight passes.
                  It never approves or executes the proposal.
                </span>
              </div>
            ) : null}
          </GlassCard>
        ))}
        {evaluation.error ? (
          <p className="text-sm text-destructive">{evaluation.error.message}</p>
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
