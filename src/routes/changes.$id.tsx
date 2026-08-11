import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { DetailRow, EmptyState, GlassCard, PageHeader, StatePill } from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  approveChangeRequest,
  getChangeRequest,
  markChangeRequestApplied,
  rejectChangeRequest,
  rollBackChangeRequest,
  verifyChangeRequest,
} from "@/lib/change-requests.functions";
import { describeOutcome, humanState, isChangeState } from "@/lib/change-request-state";
import { getTenantContext } from "@/lib/tenant.functions";

export const Route = createFileRoute("/changes/$id")({
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Proposed page change — AOOS" },
      {
        name: "description",
        content:
          "Review one exact proposed page change, the dated evidence behind it, and its execution and verification status.",
      },
      { property: "og:title", content: "Proposed page change — AOOS" },
      {
        property: "og:description",
        content: "Approve a concrete asset change, then track application and verification separately.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChangeRequestPage,
});

type FieldChange = { field?: string; label?: string; before?: string; after?: string };
type EvidenceRow = { query?: string; date?: string; average_position?: number; impressions?: number };

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function ChangeRequestPage() {
  const { id } = Route.useParams();
  const loadTenantContext = useServerFn(getTenantContext);
  const loadChange = useServerFn(getChangeRequest);
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState("");
  const [notes, setNotes] = useState("");

  const tenant = useQuery({
    queryKey: ["tenant-context"],
    queryFn: () => loadTenantContext(),
    retry: false,
  });
  const activeTenantId = tenant.data?.activeTenantId ?? null;

  const { data } = useSuspenseQuery({
    queryKey: ["change-request", id, activeTenantId],
    queryFn: () => loadChange({ data: { id } }),
    retry: false,
  });

  const approve = useServerFn(approveChangeRequest);
  const reject = useServerFn(rejectChangeRequest);
  const markApplied = useServerFn(markChangeRequestApplied);
  const verify = useServerFn(verifyChangeRequest);
  const rollBack = useServerFn(rollBackChangeRequest);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["change-request"] });
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
    void queryClient.invalidateQueries({ queryKey: ["recommendation"] });
  };

  const mutation = useMutation({
    mutationFn: async (action: "approve" | "reject" | "applied" | "verify" | "rollback") => {
      const payload = { id, notes: notes.trim() || null, revision: revision.trim() || null };
      if (action === "approve") return approve({ data: payload });
      if (action === "reject") return reject({ data: payload });
      if (action === "applied") return markApplied({ data: payload });
      if (action === "verify") return verify({ data: payload });
      return rollBack({ data: payload });
    },
    onSuccess: (result) => {
      toast.success(
        result.changed
          ? `Change request is now ${humanState(isChangeState(result.changeRequest.state) ? result.changeRequest.state : "proposed")}.`
          : "Nothing changed. This request was already in that state.",
      );
      setNotes("");
      setRevision("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const change = data.changeRequest;
  if (!change) {
    return (
      <EmptyState
        title="Change request not found"
        description="This proposal is not visible in the workspace you are working in."
      />
    );
  }

  const state = isChangeState(change.state) ? change.state : "proposed";
  const fields = asArray<FieldChange>(change.changes);
  const evidence = asArray<EvidenceRow>(change.evidence);
  const outcome = describeOutcome({
    state,
    appliedAt: change.applied_at,
    postChangeRows: data.postChangeRows,
  });
  const busy = mutation.isPending;

  const brief = [
    `Change request: ${change.title}`,
    `Page: ${change.target_url}`,
    `Source project: ${change.source_project_name ?? "unknown"} (${change.source_project_url ?? "no URL"})`,
    `Source file: ${change.source_file ?? "unknown"}`,
    `Source revision observed: ${change.source_revision_before ?? "unknown"}`,
    "",
    ...fields.map((f) => `${f.label ?? f.field}:\n  BEFORE: ${f.before ?? ""}\n  AFTER:  ${f.after ?? ""}`),
    "",
    `Why: ${change.rationale}`,
    `Evidence: ${change.evidence_summary}`,
    `Limitation: ${change.evidence_limitations}`,
  ].join("\n");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Proposed page change"
        title={change.title}
        description="One concrete change to one page. Approving authorizes the change. It does not approve the Search Console data, edit the public site, or publish anything."
        actions={<StatePill label={humanState(state)} tone={state === "rejected" ? "danger" : "primary"} />}
      />

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">What you are approving</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Two text changes on <span className="text-foreground">{change.target_url}</span>. Nothing else on
          the page, the site, or the workspace changes.
        </p>
        <ul className="mt-4 space-y-3">
          {fields.map((field) => (
            <li key={field.field ?? field.label} className="rounded-xl border border-border/60 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{field.label ?? field.field}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Before: <span className="text-foreground">{field.before}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                After: <span className="text-foreground">{field.after}</span>
              </p>
            </li>
          ))}
        </ul>
        {state === "proposed" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => mutation.mutate("approve")}>
              Approve change
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => mutation.mutate("reject")}>
              Reject change
            </Button>
          </div>
        ) : null}
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Why this was proposed</h2>
          <p className="mt-2 text-sm text-muted-foreground">{change.rationale}</p>
          <p className="mt-3 text-sm text-muted-foreground">{change.evidence_summary}</p>
          <p className="mt-3 rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
            Limitation: {change.evidence_limitations}
          </p>
          {change.risk_note ? (
            <p className="mt-3 text-sm text-muted-foreground">Risk: {change.risk_note}</p>
          ) : null}
        </GlassCard>

        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Evidence on file</h2>
          {evidence.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No evidence rows are attached.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {evidence.map((row, index) => (
                <li key={`${row.query}-${row.date}-${index}`} className="text-sm text-muted-foreground">
                  <span className="text-foreground">{row.query}</span> — average position{" "}
                  {row.average_position} on {row.date}, {row.impressions} impression
                  {row.impressions === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>

      {state === "approved" || state === "applied" || state === "verified" ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Execution</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            AOOS will not alter or publish the site automatically. There is no proven write connector into the
            site project, so a person makes this edit there and records it back here.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {change.source_project_url ? (
              <Button asChild variant="outline" size="sm">
                <a href={change.source_project_url} target="_blank" rel="noreferrer">
                  Open site project to execute
                </a>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(brief);
                toast.success("Execution brief copied.");
              }}
            >
              Copy execution brief
            </Button>
          </div>

          {state === "approved" ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                Once the edit is live in the site project, record it. Marking applied does not mean verified.
              </p>
              <Input
                value={revision}
                onChange={(event) => setRevision(event.target.value)}
                placeholder="Resulting revision (optional)"
              />
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Notes (optional)"
              />
              <Button variant="outline" size="sm" disabled={busy} onClick={() => mutation.mutate("applied")}>
                Mark applied
              </Button>
            </div>
          ) : null}

          {state === "applied" ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                Applied on {change.applied_at?.slice(0, 10)}
                {change.source_revision_after ? `, revision ${change.source_revision_after}` : ""}. Verification
                is pending until post-change data is reviewed.
              </p>
              {data.postChangeRows.length === 0 ? (
                <p className="rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
                  Waiting for finalized post-change Search Console data. No data is not evidence of success.
                </p>
              ) : (
                <>
                  <Textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Verification notes (optional)"
                  />
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => mutation.mutate("verify")}>
                    Mark verified
                  </Button>
                </>
              )}
            </div>
          ) : null}

        </GlassCard>
      ) : null}

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Outcome</h2>
        <p className="mt-2 text-sm text-muted-foreground">{outcome.message}</p>
        <dl className="mt-3">
          <DetailRow label="Approved" value={change.approved_at?.slice(0, 10) ?? "Not approved"} />
          <DetailRow label="Applied" value={change.applied_at?.slice(0, 10) ?? "Not applied"} />
          <DetailRow label="Verified" value={change.verified_at?.slice(0, 10) ?? "Not verified"} />
          <DetailRow label="Rolled back" value={change.rolled_back_at?.slice(0, 10) ?? "No"} />
        </dl>
        {data.postChangeRows.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {data.postChangeRows.map((row, index) => (
              <li key={`${row.query}-${row.date}-${index}`} className="text-sm text-muted-foreground">
                <span className="text-foreground">{row.query}</span> — position {row.position} on {row.date},{" "}
                {row.impressions} impressions
              </li>
            ))}
          </ul>
        ) : null}
        {change.verification_followup ? (
          <p className="mt-3 text-sm text-muted-foreground">{change.verification_followup}</p>
        ) : null}
      </GlassCard>

      {state === "applied" || state === "verified" ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Rollback</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            To undo this, restore the stored before values in the site project:
          </p>
          <ul className="mt-3 space-y-2">
            {fields.map((field) => (
              <li key={`rollback-${field.field}`} className="text-sm text-muted-foreground">
                {field.label ?? field.field}: <span className="text-foreground">{field.before}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => mutation.mutate("rollback")}>
              Mark rolled back
            </Button>
          </div>
        </GlassCard>
      ) : null}

      <details className="rounded-xl border border-border/60 p-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">Implementation detail</summary>
        <dl className="mt-3">
          <DetailRow label="Source project" value={change.source_project_name ?? "Unknown"} />
          <DetailRow label="Source file" value={change.source_file ?? "Unknown"} />
          <DetailRow label="Revision observed" value={change.source_revision_before ?? "Unknown"} />
          <DetailRow label="Revision after" value={change.source_revision_after ?? "Not recorded"} />
          <DetailRow label="Method" value={change.implementation_method} />
        </dl>
      </details>

      <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to Inbox
      </Link>
    </div>
  );
}
