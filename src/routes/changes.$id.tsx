import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { ExecutionCard } from "@/components/os/execution-card";
import {
  DetailRow,
  EmptyState,
  GlassCard,
  PageHeader,
  StatePill,
} from "@/components/os/primitives";

import { OperatorRouteError } from "@/components/os/route-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  approveChangeRequest,
  getChangeRequest,
  rejectChangeRequest,
  rollBackChangeRequest,
  verifyChangeRequest,
} from "@/lib/change-requests.functions";
import { describeOutcome, humanState, isChangeState } from "@/lib/change-request-state";
import { editTitleH1Proposal, regenerateTitleH1Proposal } from "@/lib/title-h1-proposals.functions";
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
        content:
          "Approve a concrete asset change, then track application and verification separately.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChangeRequestPage,
});

type FieldChange = { field?: string; label?: string; before?: string; after?: string };
type EvidenceRow = {
  source?: string;
  query?: string;
  date?: string;
  position?: number;
  average_position?: number;
  impressions?: number;
  clicks?: number;
  domain?: string;
  url?: string;
  title?: string;
  h1?: string;
  observedAt?: string;
  rows?: unknown;
};
type ProposalVersion = {
  id: string;
  version_number: number;
  revision_kind: string;
  changes: unknown;
  rationale: string;
  created_at: string;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function ProposalRevisionPanel({
  id,
  fields,
  rationale,
  versions,
  editable,
  onChanged,
}: {
  id: string;
  fields: FieldChange[];
  rationale: string;
  versions: ProposalVersion[];
  editable: boolean;
  onChanged: () => void;
}) {
  const edit = useServerFn(editTitleH1Proposal);
  const regenerate = useServerFn(regenerateTitleH1Proposal);
  const [seoTitle, setSeoTitle] = useState(
    fields.find((field) => field.field === "seo_title")?.after ?? "",
  );
  const [h1, setH1] = useState(fields.find((field) => field.field === "page_heading")?.after ?? "");
  const [reason, setReason] = useState(rationale);

  const revision = useMutation({
    mutationFn: (action: "edit" | "regenerate") =>
      action === "regenerate"
        ? regenerate({ data: { id } })
        : edit({ data: { id, seoTitle, h1, rationale: reason } }),
    onSuccess: (result) => {
      toast.success(
        result.versionNumber
          ? `Saved immutable revision ${result.versionNumber}.`
          : "Proposal updated.",
      );
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <GlassCard className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Draft wording and revisions</h2>
      {editable ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Editing saves a new immutable revision. Regenerate calls Gemini once using fresh
            required evidence and optional knowledge writing guidance.
          </p>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">SEO title</span>
              <Input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">H1</span>
              <Input value={h1} onChange={(event) => setH1(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Rationale</span>
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={revision.isPending} onClick={() => revision.mutate("edit")}>
              Save edit
            </Button>
            <Button
              variant="outline"
              disabled={revision.isPending}
              onClick={() => revision.mutate("regenerate")}
            >
              Regenerate with fresh evidence
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Approved wording and evidence are locked. This history cannot be changed.
        </p>
      )}

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Immutable revision history
      </h3>
      {versions.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Initial generation creates no version record. The first edit or regeneration creates
          revision 1.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {versions.map((version) => {
            const versionFields = asArray<FieldChange>(version.changes);
            return (
              <li key={version.id} className="rounded-xl border border-border/60 p-3">
                <p className="text-sm font-medium text-foreground">
                  Revision {version.version_number} · {version.revision_kind}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(version.created_at).toLocaleString()}
                </p>
                <ul className="mt-2 space-y-1">
                  {versionFields.map((field) => (
                    <li key={field.field ?? field.label} className="text-sm text-muted-foreground">
                      {field.label ?? field.field}:{" "}
                      <span className="text-foreground">{field.after}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-muted-foreground">{version.rationale}</p>
              </li>
            );
          })}
        </ol>
      )}
    </GlassCard>
  );
}

const providerLabels: Record<string, string> = {
  live_page: "Live page",
  gsc: "Google Search Console",
  ga4: "Google Analytics 4",
  dataforseo_organic: "DataForSEO organic",
  serpapi_transparency: "SerpAPI Ads Transparency",
  serpapi_paid_serp: "SerpAPI live paid SERP",
  knowledge: "Knowledge review guidance",
};

type MeasurementView = {
  cycle: Record<string, unknown> | null;
  windows: Record<string, unknown>[];
  observations: Record<string, unknown>[];
  revisions: Record<string, unknown>[];
};

function MeasurementHistory({ measurement }: { measurement: MeasurementView }) {
  if (!measurement.cycle) return null;
  return (
    <GlassCard className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Measurement history</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The approval baseline is frozen separately from the rendered live anchor. Providers keep
        their own roles; this history does not calculate success or verify the change automatically.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {measurement.windows.map((window) => {
          const observations = measurement.observations.filter(
            (row) => row["window_id"] === window["id"],
          );
          return (
            <div key={String(window["id"])} className="rounded-xl border border-border/60 p-3">
              <p className="text-sm font-medium text-foreground">
                {Number(window["window_days"]) === 0
                  ? "Immutable approval baseline"
                  : String(window["window_days"]) + "-day window"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {String(window["period_start_pt"])} through {String(window["period_end_pt"])} ·
                available after {String(window["available_after_pt"])}
              </p>
              {observations.length ? (
                <ul className="mt-3 space-y-2">
                  {observations.map((row) => (
                    <li key={String(row["id"])} className="text-sm text-muted-foreground">
                      <span className="text-foreground">
                        {providerLabels[String(row["provider"])] ?? String(row["provider"])}
                      </span>
                      {" · revision " +
                        String(row["revision_number"]) +
                        " · " +
                        String(row["source_role"]).replaceAll("_", " ") +
                        " · " +
                        String(row["status"])}
                      <span className="mt-0.5 block text-xs">
                        Captured {new Date(String(row["captured_at"])).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No provider observations are available yet.
                </p>
              )}
            </div>
          );
        })}
      </div>
      {measurement.revisions.length ? (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Append-only notes and anchors
          </p>
          {measurement.revisions.map((revision) => (
            <p key={String(revision["id"])} className="mt-2 text-sm text-muted-foreground">
              <span className="text-foreground">
                {String(revision["kind"]).replaceAll("_", " ")}
              </span>
              {" · " + String(revision["summary"])}
            </p>
          ))}
        </div>
      ) : null}
    </GlassCard>
  );
}
function ChangeRequestPage() {
  const { id } = Route.useParams();
  const loadTenantContext = useServerFn(getTenantContext);
  const loadChange = useServerFn(getChangeRequest);
  const queryClient = useQueryClient();
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
  const verify = useServerFn(verifyChangeRequest);
  const rollBack = useServerFn(rollBackChangeRequest);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["change-request"] });
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
    void queryClient.invalidateQueries({ queryKey: ["recommendation"] });
  };

  const mutation = useMutation({
    mutationFn: async (action: "approve" | "reject" | "verify" | "rollback") => {
      const payload = { id, notes: notes.trim() || null, revision: null };
      if (action === "approve") return approve({ data: payload });
      if (action === "reject") return reject({ data: payload });
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
  const practicalState =
    state === "rejected"
      ? "Rejected"
      : state === "rolled_back"
        ? "Rolled back"
        : change.proposal_type === "title_h1"
          ? state === "proposed"
            ? "Draft"
            : change.published_proof_at || state === "applied" || state === "verified"
              ? "Live"
              : change.source_commit_sha
                ? "Committed"
                : "Approved"
          : humanState(state);

  const brief = [
    `Change request: ${change.title}`,
    `Page: ${change.target_url}`,
    `Source project: ${change.source_project_name ?? "unknown"} (${change.source_project_url ?? "no URL"})`,
    `Source file: ${change.source_file ?? "unknown"}`,
    `Source revision observed: ${change.source_revision_before ?? "unknown"}`,
    "",
    ...fields.map(
      (f) => `${f.label ?? f.field}:\n  BEFORE: ${f.before ?? ""}\n  AFTER:  ${f.after ?? ""}`,
    ),
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
        actions={
          <StatePill
            label={practicalState}
            tone={state === "rejected" || state === "rolled_back" ? "danger" : "primary"}
          />
        }
      />

      {data.originSeoRun ? (
        <div>
          <Button asChild variant="outline" size="sm">
            <Link to="/seo-runs/$id" params={{ id: data.originSeoRun.id }}>
              Back to originating SEO run
            </Link>
          </Button>
        </div>
      ) : null}

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">What you are approving</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Two text changes on <span className="text-foreground">{change.target_url}</span>. Nothing
          else on the page, the site, or the workspace changes.
        </p>
        <ul className="mt-4 space-y-3">
          {fields.map((field) => (
            <li key={field.field ?? field.label} className="rounded-xl border border-border/60 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {field.label ?? field.field}
              </p>
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

      {change.proposal_type === "title_h1" ? (
        <ProposalRevisionPanel
          key={`${id}:${change.revision_count}`}
          id={id}
          fields={fields}
          rationale={change.rationale}
          versions={data.versions}
          editable={state === "proposed"}
          onChanged={invalidate}
        />
      ) : null}

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
            <div className="mt-3 space-y-4">
              {evidence.map((group, index) => {
                if (group.source === "live_page") {
                  return (
                    <div key="live-page" className="rounded-xl border border-border/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Live page
                      </p>
                      <p className="mt-2 text-sm text-foreground">{group.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">H1: {group.h1}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {group.url} · observed {group.observedAt}
                      </p>
                    </div>
                  );
                }

                if (group.source === "google_search_console") {
                  const rows = asArray<EvidenceRow>(group.rows);
                  return (
                    <div key="gsc" className="rounded-xl border border-border/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Google Search Console · exact page
                      </p>
                      <ul className="mt-2 space-y-2">
                        {rows.map((row, rowIndex) => (
                          <li
                            key={`${row.query}-${row.date}-${rowIndex}`}
                            className="text-sm text-muted-foreground"
                          >
                            <span className="text-foreground">{row.query}</span> — position{" "}
                            {row.position} on {row.date}, {row.impressions} impressions,{" "}
                            {row.clicks} clicks
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }

                if (group.source === "dataforseo_competitors") {
                  const rows = asArray<EvidenceRow>(group.rows);
                  return (
                    <div key="dataforseo" className="rounded-xl border border-border/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        DataForSEO · active tracked competitors
                      </p>
                      <ul className="mt-2 space-y-2">
                        {rows.map((row, rowIndex) => (
                          <li
                            key={`${row.domain}-${row.url}-${rowIndex}`}
                            className="text-sm text-muted-foreground"
                          >
                            <span className="text-foreground">{row.title}</span> — {row.domain},
                            position {row.position} for {row.query}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }

                return (
                  <p
                    key={`${group.query}-${group.date}-${index}`}
                    className="text-sm text-muted-foreground"
                  >
                    <span className="text-foreground">
                      {group.query ?? group.source ?? "Evidence"}
                    </span>
                    {group.date
                      ? ` — average position ${group.average_position ?? group.position ?? "unknown"} on ${group.date}, ${group.impressions ?? 0} impressions`
                      : null}
                  </p>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      <MeasurementHistory measurement={data.measurement as MeasurementView} />

      {state === "rejected" || state === "rolled_back" ? null : (
        <ExecutionCard
          id={id}
          state={state}
          appliedAt={change.applied_at}
          sourceCommitSha={change.source_commit_sha}
          sourceCommitUrl={change.source_commit_url}
          sourceCommittedAt={change.source_committed_at}
          publishedProofAt={change.published_proof_at}
          publishedProofNotes={change.published_proof_notes}
          sourceProjectUrl={change.source_project_url}
          brief={brief}
          postChangeCount={data.postChangeRows.length}
          notes={notes}
          onNotesChange={setNotes}
          busy={busy}
          onVerify={() => mutation.mutate("verify")}
          onInvalidate={invalidate}
        />
      )}

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
              <li
                key={`${row.query}-${row.date}-${index}`}
                className="text-sm text-muted-foreground"
              >
                <span className="text-foreground">{row.query}</span> — position {row.position} on{" "}
                {row.date}, {row.impressions} impressions
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
                {field.label ?? field.field}:{" "}
                <span className="text-foreground">{field.before}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => mutation.mutate("rollback")}
            >
              Mark rolled back
            </Button>
          </div>
        </GlassCard>
      ) : null}

      <details className="rounded-xl border border-border/60 p-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Implementation detail
        </summary>
        <dl className="mt-3">
          <DetailRow label="Source project" value={change.source_project_name ?? "Unknown"} />
          <DetailRow label="Source file" value={change.source_file ?? "Unknown"} />
          <DetailRow label="Revision observed" value={change.source_revision_before ?? "Unknown"} />
          <DetailRow
            label="Revision after"
            value={change.source_revision_after ?? "Not recorded"}
          />
          <DetailRow label="Method" value={change.implementation_method} />
        </dl>
      </details>

      <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
        Back to Action Center
      </Link>
    </div>
  );
}
