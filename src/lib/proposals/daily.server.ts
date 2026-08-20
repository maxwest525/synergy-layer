import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { selectProposalCandidates, type PageQueryRow } from "./candidates";

type Client = SupabaseClient<Database>;

export const PROPOSAL_JOB_KEY = "propose-from-evidence";

/** Bounded work per run. A run never grows past this, however much is stored. */
const MAX_PROPOSALS_PER_RUN = 2;
/** How long one run may hold the single-flight lease. */
const LEASE_MS = 10 * 60 * 1000;

export type ProposalJobOutcome = {
  tenantId: string;
  state: "created" | "no_change" | "skipped_locked" | "paused" | "failed";
  created: number;
  considered: number;
  proposals: { url: string; changeRequestId: string }[];
  message: string;
};

type JobRow = Database["public"]["Tables"]["automation_jobs"]["Row"];

/** A configuration refusal must stop the job, not be retried every night. */
function isTerminalConfigurationFailure(message: string): boolean {
  return /not configured|missing|unauthor|forbidden|invalid credential/i.test(message);
}

async function loadJob(admin: Client, tenantId: string): Promise<JobRow> {
  const existing = await admin
    .from("automation_jobs")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("key", PROPOSAL_JOB_KEY)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;

  const inserted = await admin
    .from("automation_jobs")
    .insert({ tenant_id: tenantId, key: PROPOSAL_JOB_KEY })
    .select("*")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  return inserted.data;
}

/** Single flight: only the run that moves the lease forward may do work. */
async function acquireLease(admin: Client, job: JobRow, now: Date): Promise<boolean> {
  const { data, error } = await admin
    .from("automation_jobs")
    .update({ lease_until: new Date(now.getTime() + LEASE_MS).toISOString() })
    .eq("id", job.id)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

async function ownedHosts(admin: Client, tenantId: string): Promise<string[]> {
  const { data } = await admin
    .from("assets")
    .select("external_ref")
    .eq("tenant_id", tenantId)
    .eq("kind", "website");
  const hosts: string[] = [];
  for (const row of data ?? []) {
    if (!row.external_ref) continue;
    try {
      hosts.push(new URL(row.external_ref).hostname);
    } catch {
      // A malformed stored asset is skipped rather than silently trusted.
    }
  }
  return hosts;
}

function payloadRows(value: unknown): PageQueryRow[] {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Array.isArray(payload["rows"]) ? (payload["rows"] as PageQueryRow[]) : [];
}

/**
 * One bounded proposal pass for a single tenant.
 *
 * Reads stored Search Console evidence only, files at most a couple of
 * `proposed` change requests, and never touches anything outside the database.
 * Approval and execution stay exactly where they were.
 */
export async function runProposalJobForTenant(
  admin: Client,
  tenantId: string,
  now = new Date(),
): Promise<ProposalJobOutcome> {
  const job = await loadJob(admin, tenantId);

  // A paused job may spend one probe item to detect that the blocker cleared.
  const limit = job.paused ? 1 : MAX_PROPOSALS_PER_RUN;

  if (!(await acquireLease(admin, job, now))) {
    return {
      tenantId,
      state: "skipped_locked",
      created: 0,
      considered: 0,
      proposals: [],
      message: "Another run of this job is already in flight.",
    };
  }

  const release = async (patch: Partial<JobRow>) => {
    await admin
      .from("automation_jobs")
      .update({
        lease_until: null,
        last_run_at: now.toISOString(),
        run_count: job.run_count + 1,
        ...patch,
      })
      .eq("id", job.id);
  };

  try {
    const [snapshots, hosts, existing] = await Promise.all([
      admin
        .from("search_console_snapshots")
        .select("payload")
        .eq("tenant_id", tenantId)
        .eq("kind", "page_query")
        .order("period_start_pt", { ascending: false })
        .limit(30),
      ownedHosts(admin, tenantId),
      admin.from("change_requests").select("target_url").eq("tenant_id", tenantId),
    ]);
    if (snapshots.error) throw new Error(snapshots.error.message);
    if (existing.error) throw new Error(existing.error.message);

    const rows = (snapshots.data ?? []).flatMap((row) => payloadRows(row.payload));
    const candidates = selectProposalCandidates({
      rows,
      ownedHosts: hosts,
      excludeUrls: (existing.data ?? [])
        .map((row) => row.target_url)
        .filter((url): url is string => Boolean(url)),
      limit,
    });

    if (candidates.length === 0) {
      await release({
        last_state: "no_change",
        last_error: null,
        last_created_count: 0,
      });
      return {
        tenantId,
        state: "no_change",
        created: 0,
        considered: rows.length,
        proposals: [],
        message: "Stored evidence held no page that is not already carrying a proposal.",
      };
    }

    const { prepareTitleH1Proposal } = await import("../title-h1-proposals.server");
    const { serviceRpc } = await import("../title-h1-proposals.functions");
    const day = now.toISOString().slice(0, 10);
    const proposals: { url: string; changeRequestId: string }[] = [];
    let failure: string | null = null;

    for (const candidate of candidates) {
      try {
        const prepared = await prepareTitleH1Proposal(admin, tenantId, candidate.url);
        const result = await serviceRpc("create_title_h1_proposal", {
          _tenant_id: tenantId,
          _actor: null,
          _idempotency_key: `title-h1:auto:${day}:${candidate.url}`,
          _target_url: prepared.targetUrl,
          _title: prepared.title,
          _changes: prepared.changes,
          _rationale: prepared.rationale,
          _evidence: prepared.evidence,
          _evidence_summary: prepared.evidenceSummary,
          _evidence_limitations: prepared.evidenceLimitations,
          _risk_note: prepared.riskNote,
          _generation_context: {
            ...prepared.generationContext,
            generatedBy: "propose-from-evidence",
            selectionReason: candidate.reason,
            selectionQueries: candidate.queries,
          },
          _source_repo: prepared.sourceRepo,
          _source_branch: prepared.sourceBranch,
          _source_file: prepared.sourceFile,
          _source_project_id: prepared.sourceProjectId,
          _source_revision_before: prepared.sourceRevisionBefore,
        });
        proposals.push({ url: candidate.url, changeRequestId: result.changeRequest.id });
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        break;
      }
    }

    if (proposals.length === 0 && failure) {
      const pause = isTerminalConfigurationFailure(failure);
      await release({
        last_state: "failed",
        last_error: failure,
        last_created_count: 0,
        ...(pause ? { paused: true, paused_reason: failure, paused_at: now.toISOString() } : {}),
      });
      return {
        tenantId,
        state: pause ? "paused" : "failed",
        created: 0,
        considered: candidates.length,
        proposals: [],
        message: failure,
      };
    }

    // A successful probe clears an earlier pause; normal batches resume next run.
    await release({
      last_state: "succeeded",
      last_error: failure,
      last_created_count: proposals.length,
      paused: false,
      paused_reason: null,
      paused_at: null,
    });

    return {
      tenantId,
      state: proposals.length > 0 ? "created" : "no_change",
      created: proposals.length,
      considered: candidates.length,
      proposals,
      message:
        proposals.length > 0
          ? `Filed ${proposals.length} proposal(s) for review.`
          : "Nothing new to propose.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await release({ last_state: "failed", last_error: message });
    return {
      tenantId,
      state: "failed",
      created: 0,
      considered: 0,
      proposals: [],
      message,
    };
  }
}

/** Every tenant, one bounded pass each. */
export async function runProposalJob(admin: Client, now = new Date()) {
  const { data, error } = await admin.from("tenants").select("id");
  if (error) throw new Error(error.message);
  const results: ProposalJobOutcome[] = [];
  for (const tenant of data ?? []) {
    results.push(await runProposalJobForTenant(admin, tenant.id, now));
  }
  return { tenants: results.length, results };
}
