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
} from "@/lib/execution/execution.functions";

type Stage = { label: string; detail: string; done: boolean };

type Props = {
  id: string;
  state: string;
  appliedAt: string | null;
  sourceProjectUrl: string | null;
  brief: string;
  postChangeCount: number;
  notes: string;
  onNotesChange: (value: string) => void;
  busy: boolean;
  onVerify: () => void;
  onInvalidate: () => void;
};

/**
 * The execution surface. It separates four different facts that are easy to
 * confuse: approved, committed to source, proven live on the public page, and
 * verified against finalized Search Console data.
 */
export function ExecutionCard(props: Props) {
  const queryClient = useQueryClient();
  const loadState = useServerFn(getExecutionState);
  const runExecute = useServerFn(executeChangeRequest);
  const runPublishCheck = useServerFn(checkChangeRequestPublished);

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
      if (result.status === "committed" || result.status === "replayed") toast.success(result.message);
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

  const data = execution.data;
  const running = execute.isPending || publishCheck.isPending;
  const committed = Boolean(data?.commitSha);
  const provenLive = Boolean(data?.publishedProofAt);

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
        ? `Commit ${data?.commitSha?.slice(0, 10)} on ${data?.branch ?? "the source branch"}.`
        : "No commit exists for this change request yet.",
      done: committed,
    },
    {
      label: "Proven live on the public page",
      detail: provenLive
        ? `Checked and matched on ${data?.publishedProofAt?.slice(0, 10)}.`
        : "The public page has not been proven to serve the approved title and H1.",
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
        AOOS can commit this exact edit to the source file it recorded. It cannot publish the site, and a
        commit is not proof that the public page changed.
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
          {data.executorCredentialPresent ? "" : " · Executor credential missing, so no write can be attempted."}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
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
        {data?.isOperator && committed ? (
          <Button variant="outline" size="sm" disabled={running} onClick={() => publishCheck.mutate()}>
            Check published page
          </Button>
        ) : null}
        {data?.commitUrl ? (
          <Button asChild variant="ghost" size="sm">
            <a href={data.commitUrl} target="_blank" rel="noreferrer">
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

      <p className="mt-4 text-xs text-muted-foreground">
        Provider API charge: $0. Committing to source and reading the public page use no paid provider
        credits. This does not include AI build usage in Lovable, which is billed separately.
      </p>

      {props.state === "applied" ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            Applied on {props.appliedAt?.slice(0, 10)}. Applied means proven live, not verified.
          </p>
          {props.postChangeCount === 0 ? (
            <p className="rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
              Waiting for finalized post-change Search Console data. No data is not evidence of success.
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
              {attempt.createdAt.slice(0, 16).replace("T", " ")} · {attempt.kind.replace("_", " ")} ·{" "}
              <span className="text-foreground">{attempt.status}</span>
              {attempt.error ? ` — ${attempt.error}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </GlassCard>
  );
}
