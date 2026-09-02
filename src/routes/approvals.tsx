import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  DetailRow,
  EmptyState,
  GlassCard,
  PageHeader,
  PageStack,
  StatePill,
} from "@/components/os/primitives";
import { formatWhen } from "@/lib/format-when";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listPendingApprovals, type PendingApprovalRow } from "@/lib/approvals.functions";
import { approveChangeRequest, rejectChangeRequest } from "@/lib/change-requests.functions";

const approvalsQuery = {
  queryKey: ["pending-approvals"],
  queryFn: () => listPendingApprovals(),
};

export const Route = createFileRoute("/approvals")({
  ssr: false,
  errorComponent: OperatorRouteError,
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(approvalsQuery);
  },
  head: () => ({
    meta: [
      { title: "Approvals queue · Marky" },
      {
        name: "description",
        content:
          "Every suggestion waiting on your yes or no, with the evidence behind it. Approve or reject with a note in one place.",
      },
      { property: "og:title", content: "Approvals queue · Marky" },
      {
        property: "og:description",
        content: "Review pending suggestions and approve or reject them with notes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { data } = useSuspenseQuery(approvalsQuery);

  return (
    <PageStack>
      <PageHeader
        eyebrow="Decide"
        title="Approvals queue"
        description="Everything below is stopped until you decide. Read the evidence, add a note if the decision needs explaining, then approve or reject. Nothing reaches a live page without an approval here."
      />

      {data.changes.length === 0 ? (
        <EmptyState
          title="Nothing is waiting on you"
          description="No proposed page change is in the queue. New suggestions land here the moment evidence supports a concrete edit."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <StatePill label={`${data.changes.length} waiting on your decision`} tone="warning" />
            <span className="text-xs text-muted-foreground">Oldest first</span>
          </div>
          <ul className="space-y-4">
            {data.changes.map((row) => (
              <li key={row.id}>
                <ApprovalCard row={row} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.otherQueues.length > 0 ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Other decisions waiting</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These queues are decided on their own screen because approving them does different work.
          </p>
          <ul className="mt-4 space-y-2">
            {data.otherQueues.map((queue) => (
              <li
                key={queue.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/30 px-3 py-2"
              >
                <p className="text-sm text-foreground">
                  {queue.label} <span className="text-muted-foreground">&mdash;</span>{" "}
                  <span className="text-primary">{queue.instruction}</span>
                </p>
                <Link
                  to={queue.to}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  {queue.actionLabel}
                  <ArrowRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </PageStack>
  );
}

function ApprovalCard({ row }: { row: PendingApprovalRow }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const approve = useServerFn(approveChangeRequest);
  const reject = useServerFn(rejectChangeRequest);

  const decide = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      const payload = { id: row.id, notes: notes.trim() === "" ? null : notes.trim() };
      return decision === "approve" ? approve({ data: payload }) : reject({ data: payload });
    },
    onSuccess: async (_result, decision) => {
      toast.success(
        decision === "approve"
          ? "Approved. It moves to execution and stays tracked until it is verified."
          : "Rejected. Nothing was changed on the site.",
      );
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["change-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["command-center"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "The decision could not be recorded.");
    },
  });

  const busy = decide.isPending;

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/changes/$id"
            params={{ id: row.id }}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {row.title}
          </Link>
          <p className="mt-1 break-all text-xs text-muted-foreground">{row.targetUrl}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatePill label={row.proposalType} />
          <StatePill label="waiting on you" tone="warning" />
        </div>
      </div>

      <div className="mt-4 space-y-1">
        <DetailRow label="Why" value={row.rationale} />
        <DetailRow label="Evidence" value={row.evidenceSummary} />
        {row.evidenceLimitations ? (
          <DetailRow label="Limits of that evidence" value={row.evidenceLimitations} />
        ) : null}
        {row.riskNote ? <DetailRow label="Risk" value={row.riskNote} /> : null}
        <DetailRow label="How it would be applied" value={row.implementationMethod} />
        <DetailRow
          label="Proposed"
          value={`${formatWhen(row.proposedAt)}${row.revisionCount > 0 ? ` · ${row.revisionCount} revision${row.revisionCount === 1 ? "" : "s"}` : ""}`}
        />
      </div>

      <div className="mt-4 space-y-2">
        <label
          htmlFor={`notes-${row.id}`}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Decision note (optional, stored with the decision)
        </label>
        <Textarea
          id={`notes-${row.id}`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Why you are approving or rejecting this. Anyone reading the record later sees this note."
          disabled={busy}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => decide.mutate("approve")}
          disabled={busy}
          className="border-primary/50 text-primary hover:bg-primary/10"
        >
          {busy && decide.variables === "approve" ? "Approving..." : "Approve"}
        </Button>
        <Button
          variant="outline"
          onClick={() => decide.mutate("reject")}
          disabled={busy}
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
        >
          {busy && decide.variables === "reject" ? "Rejecting..." : "Reject"}
        </Button>
        <Link
          to="/changes/$id"
          params={{ id: row.id }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Open the full record
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </GlassCard>
  );
}
