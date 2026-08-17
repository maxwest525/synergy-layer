import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import {
  BackLink,
  EmptyNote,
  formatWhen,
  GlassCard,
  PageHeader,
  StatePill,
} from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { isSeoRunEligibleForPreparation } from "@/lib/seo-runs/eligibility";
import { evaluateSeoRun, getSeoRun, repairSeoRunProposalEvent } from "@/lib/seo-runs/functions";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/seo-runs/$id")({
  ssr: false,
  head: () => ({ meta: [{ title: "SEO Run — AOOS" }, { name: "robots", content: "noindex" }] }),
  errorComponent: OperatorRouteError,
  component: SeoRunDetailPage,
});

type UnknownRecord = Record<string, unknown>;

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is UnknownRecord =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function SeoRunDetailPage() {
  const { id } = Route.useParams();
  const load = useServerFn(getSeoRun);
  const evaluate = useServerFn(evaluateSeoRun);
  const repairProposalEvent = useServerFn(repairSeoRunProposalEvent);
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: ["seo-run", id],
    queryFn: () => load({ data: { id } }),
  });
  const { run, events, proposalEventRepairAvailable } = data;
  const evaluation = useMutation({
    mutationFn: () => evaluate({ data: { id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["seo-run", id] }),
        queryClient.invalidateQueries({ queryKey: ["seo-runs"] }),
      ]);
    },
  });
  const proposalEventRepair = useMutation({
    mutationFn: () => repairProposalEvent({ data: { id } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["seo-run", id] }),
        queryClient.invalidateQueries({ queryKey: ["seo-runs"] }),
      ]);
    },
  });
  const connectors = records(run.connector_snapshot);
  const evidence =
    run.evidence_snapshot &&
    typeof run.evidence_snapshot === "object" &&
    !Array.isArray(run.evidence_snapshot)
      ? (run.evidence_snapshot as UnknownRecord)
      : {};

  return (
    <div className="space-y-10">
      <BackLink to="/seo-runs">All SEO runs</BackLink>
      <PageHeader
        eyebrow="Governed SEO run"
        title={run.target_url}
        description="The stored lifecycle and proof for this page. Approval and execution remain separate."
      />

      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Current state</p>
            <StatePill
              label={run.state.replaceAll("_", " ")}
              tone={run.state === "verified" ? "success" : "primary"}
            />
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/seo-runs">Back to SEO Runs</Link>
          </Button>
        </div>
        {run.failure_reason ? (
          <p className="mt-4 rounded-xl border border-destructive/40 p-3 text-sm text-destructive">
            {run.failure_reason}
          </p>
        ) : null}
        {run.change_request_id ? (
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/changes/$id" params={{ id: run.change_request_id }}>
              Open exact proposed change
            </Link>
          </Button>
        ) : (
          <EmptyNote className="mt-4">No concrete proposal is linked yet.</EmptyNote>
        )}
        {isSeoRunEligibleForPreparation(run) ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={evaluation.isPending}
              onClick={() => evaluation.mutate()}
            >
              {evaluation.isPending ? "Checking evidence…" : "Check evidence and prepare proposal"}
            </Button>
            {evaluation.error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {evaluation.error.message}
              </p>
            ) : null}
          </div>
        ) : null}
        {proposalEventRepairAvailable ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={proposalEventRepair.isPending}
              onClick={() => proposalEventRepair.mutate()}
            >
              {proposalEventRepair.isPending ? "Repairing timeline…" : "Repair proposal timeline"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Restores the saved proposal event from durable data. This makes no provider requests.
            </p>
            {proposalEventRepair.error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {proposalEventRepair.error.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Connector proof</h2>
          {connectors.length ? (
            <ul className="mt-3 space-y-2">
              {connectors.map((connector, index) => (
                <li
                  key={`${String(connector["capabilityKey"])}-${index}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-foreground">
                    {String(connector["capabilityKey"] ?? "Unknown connector")}
                  </span>
                  <span className="text-muted-foreground">
                    {String(connector["integrationState"] ?? "missing")} ·{" "}
                    {String(connector["health"] ?? "unknown")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Preflight has not stored connector proof yet.
            </p>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Evidence snapshot</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Search Console rows</dt>
              <dd className="text-foreground">
                {String(evidence["searchConsoleRows"] ?? "Not checked")}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">DataForSEO snapshots</dt>
              <dd className="text-foreground">
                {String(evidence["dataForSeoSnapshots"] ?? "Not checked")}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Knowledge chunks</dt>
              <dd className="text-foreground">{run.knowledge_chunk_ids.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Authority findings</dt>
              <dd className="text-foreground">{run.authority_finding_ids.length}</dd>
            </div>
          </dl>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Run timeline</h2>
        <ol className="mt-4 space-y-3">
          {events.map((event) => (
            <li key={event.id} className="border-l border-border pl-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatePill label={event.state.replaceAll("_", " ")} tone="neutral" />
                <span className="text-xs text-muted-foreground">
                  {formatWhen(event.occurred_at)}
                </span>
              </div>
              <p className="mt-2 text-sm text-foreground">{event.summary}</p>
            </li>
          ))}
        </ol>
      </GlassCard>
    </div>
  );
}
