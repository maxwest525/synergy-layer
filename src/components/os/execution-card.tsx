import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { GlassCard } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  checkChangeRequestPublished,
  executeChangeRequest,
  getExecutionState,
  testGithubConnection,
} from "@/lib/execution/execution.functions";
import { reconcileExecutionFacts, reconcileReadinessFacts } from "@/lib/execution/timeline";
import { OutcomeVerdictContext, type VerdictReading } from "./outcome-verdict-context";

type Stage = { label: string; detail: string; done: boolean };

type Props = {
  id: string;
  state: string;
  appliedAt: string | null;
  sourceCommitSha: string | null;
  sourceCommitUrl: string | null;
  sourceCommittedAt: string | null;
  publishedProofAt: string | null;
  publishedProofNotes: string | null;
  sourceProjectUrl: string | null;
  brief: string;
  postChangeCount: number;
  /** This change's graded readings, shown beside Mark verified as context. */
  verdicts: VerdictReading[];
  notes: string;
  onNotesChange: (value: string) => void;
  busy: boolean;
  onVerify: () => void;
  onInvalidate: () => void;
};

/** Truthful, itemised cost. Silence about credits is not the same as free. */
function CostNote() {
  return (
    <div className="mt-4 space-y-1 text-xs text-muted-foreground">
      <p>
        Provider API charge for reading from and committing to source: $0. GitHub reads and writes
        are not metered here, and the read-only connection test costs nothing.
      </p>
      <p>
        Each rendered publish check spends 1 Firecrawl credit from the connected account. Nothing
        else in this slice calls a paid provider.
      </p>
      <p>
        Lovable build credits are separate and are not $0. Known build usage through the work before
        this pass is 51.7 credits in total: PageSpeed slice 18.0, first execution adapter 9.2,
        corrective adapter pass 10.7, preflight and security pass 11.2, and runtime verification
        pass 2.6. The current pass is not included in that 51.7 subtotal and is billed the same way.
      </p>
    </div>
  );
}

/**
 * The execution surface. It separates facts that are easy to confuse: readiness
 * before approval, approved, committed to source, proven live on the rendered
 * page, and verified against finalized Search Console data.
 */
export function ExecutionCard(props: Props) {
  const queryClient = useQueryClient();
  const loadState = useServerFn(getExecutionState);
  const runExecute = useServerFn(executeChangeRequest);
  const runPublishCheck = useServerFn(checkChangeRequestPublished);
  const runPreflight = useServerFn(testGithubConnection);

  const execution = useQuery({
    queryKey: ["change-request-execution", props.id],
    queryFn: () => loadState({ data: { id: props.id } }),
    retry: false,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["change-request-execution", props.id] });
    props.onInvalidate();
  };

  const execute = useMutation({
    mutationFn: () => runExecute({ data: { id: props.id } }),
    onSuccess: (result) => {
      if (
        result.status === "committed" ||
        result.status === "replayed" ||
        result.status === "reconciled"
      )
        toast.success(result.message);
      else toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const publishCheck = useMutation({
    mutationFn: () => runPublishCheck({ data: { id: props.id } }),
    onSuccess: (result) => {
      if (result.status === "verified") toast.success(result.message);
      else toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const preflight = useMutation({
    mutationFn: () => runPreflight({ data: { id: props.id } }),
    onSuccess: (result) => {
      if (result.status === "proved") toast.success(result.reason);
      else toast.error(result.reason);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = execution.data;
  const facts = reconcileExecutionFacts(
    {
      sourceCommitSha: props.sourceCommitSha,
      sourceCommitUrl: props.sourceCommitUrl,
      sourceCommittedAt: props.sourceCommittedAt,
      publishedProofAt: props.publishedProofAt,
      publishedProofNotes: props.publishedProofNotes,
    },
    data,
  );
  const running = execute.isPending || publishCheck.isPending || preflight.isPending;
  const committed = Boolean(facts.commitSha);
  const provenLive = Boolean(facts.publishedProofAt);
  const readiness = reconcileReadinessFacts(data?.readiness ?? [], facts);
  const decided = props.state !== "proposed";

  const preflightButton = data?.isOperator ? (
    <Button
      variant="outline"
      size="sm"
      disabled={running || !data.executorCredentialPresent}
      onClick={() => preflight.mutate()}
    >
      {data.executorCredentialPresent
        ? "Test GitHub connection (read only)"
        : "GitHub connection test unavailable"}
    </Button>
  ) : null;

  const readinessLabel: Record<string, string> = {
    proven: "Proven",
    configured: "Configured, unproven",
    stored: "Stored",
    blocked: "Blocked",
  };

  const readinessBlock = data ? (
    <div className="mt-4">
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
        Stored configuration and live proof
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Stored means AOOS recorded it. Configured, unproven means a credential exists but has never
        answered. Proven means a live read-only check succeeded at the time shown.
      </p>
      <ul className="mt-2 space-y-2">
        {readiness.map((fact) => (
          <li key={fact.label} className="flex gap-3 text-sm">
            <span
              className={
                fact.state === "proven"
                  ? "text-primary"
                  : fact.state === "blocked"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            >
              {readinessLabel[fact.state] ?? fact.state}
            </span>
            <span>
              <span className="text-foreground">{fact.label}</span>
              <span className="block text-muted-foreground">{fact.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {data.operatorCheckFailed ? (
        <p className="mt-3 rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
          The operator role check did not complete, so execution controls are hidden. This is not a
          statement that you lack the role.
        </p>
      ) : null}
    </div>
  ) : execution.isError ? (
    <p className="mt-4 rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
      Readiness and attempt details could not be refreshed. The lifecycle stages above still use the
      commit and publication proof stored on this change request.
    </p>
  ) : (
    <p className="mt-4 text-sm text-muted-foreground">Reading execution readiness…</p>
  );

  if (!decided) {
    return (
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">
          What execution would do, if you approve
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing below runs yet. Approving does not write anything: an operator still has to press
          Execute, and every guard is re-checked at that moment.
        </p>
        {readinessBlock}
        <div className="mt-4 flex flex-wrap gap-2">
          {preflightButton}
          <Button
            variant="ghost"
            size="sm"
            disabled={execution.isFetching || running}
            onClick={() => {
              void execution.refetch();
              toast.success("Re-read stored configuration. No provider was called.");
            }}
          >
            Re-read stored configuration
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The connection test makes read-only GitHub requests with the configured token. It creates
          no commit, changes no state, and leaves this request proposed. No Execute control exists
          before approval.
        </p>
        <CostNote />
      </GlassCard>
    );
  }

  const stages: Stage[] = [
    {
      label: "Evidence observed",
      detail: "Stored Search Console rows for this page were reviewed.",
      done: true,
    },
    {
      label: "Exact action proposed",
      detail: "Two exact text values, on one file, on one page.",
      done: true,
    },
    {
      label: "Operator approved",
      detail: "A person authorized this change. Approval alone changes nothing.",
      done: true,
    },
    {
      label: "Source committed",
      detail: committed
        ? `Commit ${facts.commitSha?.slice(0, 10)} on ${data?.branch ?? "the source branch"}.`
        : "No commit exists for this change request yet.",
      done: committed,
    },
    {
      label: "Proven live on the rendered page",
      detail: provenLive
        ? `Rendered and matched on ${facts.publishedProofAt?.slice(0, 10)}.`
        : "The rendered public page has not been proven to serve the approved title and H1.",
      done: provenLive,
    },
    {
      label: "Outcome verified",
      detail:
        props.postChangeCount > 0
          ? "Finalized post-change Search Console rows are on file."
          : "Waiting for finalized post-change Search Console data. No data is not evidence of success.",
      done: props.state === "verified",
    },
  ];

  return (
    <GlassCard className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Execution</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        AOOS can commit this exact edit to the source file it recorded. Publishing and rendered-page
        proof remain separate steps; a commit alone is not proof that the public page changed.
      </p>

      <ol className="mt-4 space-y-2">
        {stages.map((stage) => (
          <li key={stage.label} className="flex gap-3 text-sm">
            <span className={stage.done ? "text-primary" : "text-muted-foreground"}>
              {stage.done ? "Done" : "Not yet"}
            </span>
            <span>
              <span className="text-foreground">{stage.label}</span>
              <span className="block text-muted-foreground">{stage.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      {data ? (
        <p className="mt-4 rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
          Source: {data.repo ?? "no repository recorded"} · {data.branch ?? "no branch"} ·{" "}
          {data.filePath ?? "no file"}
        </p>
      ) : null}

      {readinessBlock}

      <div className="mt-4 flex flex-wrap gap-2">
        {preflightButton}
        {data?.isOperator && !committed ? (
          <Button
            variant="outline"
            size="sm"
            disabled={running || !data.executorCredentialPresent || props.state !== "approved"}
            onClick={() => execute.mutate()}
          >
            {data.executorCredentialPresent ? "Execute this change" : "Execute unavailable"}
          </Button>
        ) : null}
        {data?.isOperator && committed && !provenLive ? (
          <Button
            variant="outline"
            size="sm"
            disabled={running || !data.rendererCredentialPresent || !data.targetAllowed}
            onClick={() => publishCheck.mutate()}
          >
            {data.rendererCredentialPresent
              ? "Check rendered page (1 Firecrawl credit)"
              : "Rendered check unavailable"}
          </Button>
        ) : null}
        {facts.commitUrl ? (
          <Button asChild variant="ghost" size="sm">
            <a href={facts.commitUrl} target="_blank" rel="noreferrer">
              View commit
            </a>
          </Button>
        ) : null}
        {props.sourceProjectUrl ? (
          <Button asChild variant="ghost" size="sm">
            <a href={props.sourceProjectUrl} target="_blank" rel="noreferrer">
              Open site project
            </a>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(props.brief);
            toast.success("Execution brief copied.");
          }}
        >
          Copy execution brief
        </Button>
      </div>

      <CostNote />

      {props.state === "applied" ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Applied on {props.appliedAt?.slice(0, 10)}. Applied means proven live, not verified.
          </p>
          <div className="rounded-lg border border-border/60 p-3">
            <OutcomeVerdictContext verdicts={props.verdicts} />
          </div>
          {props.postChangeCount === 0 ? (
            <p className="rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
              Waiting for finalized post-change Search Console data. No data is not evidence of
              success.
            </p>
          ) : (
            <>
              <Textarea
                value={props.notes}
                onChange={(event) => props.onNotesChange(event.target.value)}
                placeholder="Verification notes (optional)"
              />
              <Button variant="outline" size="sm" disabled={props.busy} onClick={props.onVerify}>
                Mark verified
              </Button>
            </>
          )}
        </div>
      ) : null}

      {data && data.attempts.length > 0 ? (
        <ul className="mt-5 space-y-2">
          {data.attempts.map((attempt) => (
            <li key={attempt.id} className="text-xs text-muted-foreground">
              {attempt.createdAt.slice(0, 16).replace("T", " ")} · {attempt.kind.replace("_", " ")}{" "}
              · <span className="text-foreground">{attempt.status}</span>
              {attempt.error ? ` — ${attempt.error}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </GlassCard>
  );
}
