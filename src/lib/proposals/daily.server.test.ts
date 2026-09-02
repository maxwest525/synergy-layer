import { beforeEach, describe, expect, it, vi } from "vitest";

import { runProposalJobForTenant } from "./daily.server";

vi.mock("../page-wording-proposals.server", () => ({ preparePageWordingProposal: vi.fn() }));
vi.mock("../page-wording-proposals.functions", () => ({ serviceRpc: vi.fn() }));

import { serviceRpc } from "../page-wording-proposals.functions";
import { preparePageWordingProposal } from "../page-wording-proposals.server";

type QueryResult = { data: unknown; error: { message: string } | null };

type FakeQuery = {
  select: () => FakeQuery;
  eq: () => FakeQuery;
  is: () => FakeQuery;
  or: () => FakeQuery;
  order: () => FakeQuery;
  limit: () => FakeQuery;
  insert: () => FakeQuery;
  update: (patch: unknown) => FakeQuery;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
  then: (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

/** Chainable, awaitable stand-in for one supabase query builder. */
function fakeQuery(result: QueryResult, capturePatch?: (patch: unknown) => void): FakeQuery {
  const q: FakeQuery = {
    select: () => q,
    eq: () => q,
    is: () => q,
    or: () => q,
    order: () => q,
    limit: () => q,
    insert: () => q,
    update: (patch) => {
      capturePatch?.(patch);
      return q;
    },
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return q;
}

const inboxItems: Record<string, unknown>[] = [];
vi.mock("../os.server", () => ({
  fileInboxItem: vi.fn(async (_client: unknown, item: Record<string, unknown>) => {
    inboxItems.push(item);
  }),
  logActivity: vi.fn(async () => undefined),
}));

const TENANT = "6a2f8f6e-0000-4000-8000-000000000001";
const CANDIDATE_URL = "https://trumoveinc.com/movers";

function createAdmin(options: { paused?: boolean } = {}) {
  const job = { id: "job-1", paused: options.paused ?? false, run_count: 4 };
  const jobUpdates: Record<string, unknown>[] = [];
  const inboxUpdates: Record<string, unknown>[] = [];
  let automationCalls = 0;
  const admin = {
    from(table: string) {
      switch (table) {
        case "automation_jobs": {
          automationCalls += 1;
          if (automationCalls === 1) return fakeQuery({ data: job, error: null });
          return fakeQuery({ data: [{ id: job.id }], error: null }, (patch) =>
            jobUpdates.push(patch as Record<string, unknown>),
          );
        }
        case "search_console_snapshots":
          return fakeQuery({
            data: [
              {
                payload: {
                  rows: [
                    {
                      keys: [CANDIDATE_URL, "long distance movers"],
                      clicks: 0,
                      impressions: 40,
                      position: 12,
                    },
                  ],
                },
              },
            ],
            error: null,
          });
        case "assets":
          return fakeQuery({ data: [{ external_ref: "https://trumoveinc.com/" }], error: null });
        case "change_requests":
          return fakeQuery({ data: [], error: null });
        case "inbox_items":
          return fakeQuery({ data: [], error: null }, (patch) =>
            inboxUpdates.push(patch as Record<string, unknown>),
          );
        default:
          throw new Error(`Unexpected table in test: ${table}`);
      }
    },
  };
  return {
    admin: admin as unknown as Parameters<typeof runProposalJobForTenant>[0],
    jobUpdates,
    inboxUpdates,
  };
}

const prepared = {
  targetUrl: CANDIDATE_URL,
  title: "Long distance movers",
  changes: [{}, {}],
  rationale: "Stored impressions with no clicks.",
  evidence: [{}, {}, {}],
  evidenceSummary: "40 impressions, 0 clicks.",
  evidenceLimitations: "Three finalized dates only.",
  riskNote: null,
  generationContext: {},
  sourceRepo: "owner/repo",
  sourceBranch: "main",
  sourceFile: "src/pages/movers.tsx",
  sourceProjectId: "project-1",
  sourceRevisionBefore: "abc123",
};

beforeEach(() => {
  vi.clearAllMocks();
  inboxItems.length = 0;
  vi.mocked(preparePageWordingProposal).mockResolvedValue(prepared as never);
});

async function runWithRpcRefusal(message: string) {
  vi.mocked(serviceRpc).mockRejectedValue(new Error(message));
  const { admin, jobUpdates } = createAdmin();
  const outcome = await runProposalJobForTenant(admin, TENANT, new Date("2026-08-28T05:00:00Z"));
  return { outcome, release: jobUpdates.at(-1) };
}

describe("the nightly propose-from-evidence job", () => {
  it("pauses instead of retrying nightly when the RPC cannot see the tenant for the job's actor", async () => {
    // The deployed create_page_wording_proposal refuses a null actor with exactly
    // this message, so until the system-actor migration is applied the job
    // must pause rather than record a failure every night forever.
    const { outcome, release } = await runWithRpcRefusal(
      "That tenant is not visible to this account.",
    );

    expect(serviceRpc).toHaveBeenCalledWith(
      "create_page_wording_proposal",
      expect.objectContaining({ _tenant_id: TENANT, _actor: null }),
    );
    expect(outcome.state).toBe("paused");
    expect(release).toMatchObject({
      last_state: "failed",
      paused: true,
      paused_reason: "That tenant is not visible to this account.",
    });
    // The pause reaches the Inbox the night it happens (MON-9).
    expect(inboxItems).toHaveLength(1);
    expect(inboxItems[0]).toMatchObject({
      lane: "needs_attention",
      sourceModule: "propose-from-evidence",
      title: "The nightly proposal job paused itself",
      subjectKind: "proposal_job",
      tenantId: TENANT,
    });
    expect(inboxItems[0]!["summary"]).toContain("That tenant is not visible to this account.");
  });

  it("does not file a second Inbox item on the probe nights that follow a pause", async () => {
    vi.mocked(serviceRpc).mockRejectedValue(
      new Error("That tenant is not visible to this account."),
    );
    const { admin, jobUpdates, inboxUpdates } = createAdmin({ paused: true });
    const outcome = await runProposalJobForTenant(admin, TENANT, new Date("2026-08-29T05:00:00Z"));
    expect(outcome.state).toBe("paused");
    expect(jobUpdates.at(-1)).toMatchObject({ paused: true });
    expect(inboxItems).toHaveLength(0);
    expect(inboxUpdates).toHaveLength(0);
  });

  it("resolves the pause item the night a probe succeeds", async () => {
    vi.mocked(serviceRpc).mockResolvedValue({
      changeRequest: { id: "cr-2" },
      changed: true,
      versionNumber: null,
    });
    const { admin, jobUpdates, inboxUpdates } = createAdmin({ paused: true });
    const outcome = await runProposalJobForTenant(admin, TENANT, new Date("2026-08-30T05:00:00Z"));
    expect(outcome.state).toBe("created");
    expect(jobUpdates.at(-1)).toMatchObject({ last_state: "succeeded", paused: false });
    expect(inboxUpdates).toEqual([
      { lane: "completed", resolved_at: new Date("2026-08-30T05:00:00Z").toISOString() },
    ]);
    expect(inboxItems).toHaveLength(0);
  });

  it("pauses when the RPC refuses the actor's authority to generate proposals", async () => {
    const { outcome, release } = await runWithRpcRefusal(
      "Only an operator or admin can generate a proposal.",
    );
    expect(outcome.state).toBe("paused");
    expect(release).toMatchObject({ paused: true });
  });

  it("pauses when no renderer is configured for the required live-page evidence", async () => {
    vi.mocked(preparePageWordingProposal).mockRejectedValue(
      new Error(
        "Required live-page evidence is unavailable: no Firecrawl deployment is configured, self-hosted or cloud.",
      ),
    );
    const { admin, jobUpdates } = createAdmin();
    const outcome = await runProposalJobForTenant(admin, TENANT, new Date("2026-08-28T05:00:00Z"));
    expect(outcome.state).toBe("paused");
    expect(jobUpdates.at(-1)).toMatchObject({ paused: true });
  });

  it("keeps retrying a transient failure rather than pausing", async () => {
    const { outcome, release } = await runWithRpcRefusal("fetch failed");
    expect(outcome.state).toBe("failed");
    expect(release).toMatchObject({ last_state: "failed" });
    expect(release).not.toHaveProperty("paused");
  });

  it("files the proposal as the system actor and records the run as succeeded", async () => {
    vi.mocked(serviceRpc).mockResolvedValue({
      changeRequest: { id: "cr-1" },
      changed: true,
      versionNumber: null,
    });
    const { admin, jobUpdates } = createAdmin();

    const outcome = await runProposalJobForTenant(admin, TENANT, new Date("2026-08-28T05:00:00Z"));

    expect(serviceRpc).toHaveBeenCalledWith(
      "create_page_wording_proposal",
      expect.objectContaining({
        _tenant_id: TENANT,
        _actor: null,
        _idempotency_key: `page-wording:auto:2026-08-28:${CANDIDATE_URL}`,
        _target_url: CANDIDATE_URL,
      }),
    );
    expect(outcome.state).toBe("created");
    expect(outcome.proposals).toEqual([{ url: CANDIDATE_URL, changeRequestId: "cr-1" }]);
    expect(jobUpdates.at(-1)).toMatchObject({
      last_state: "succeeded",
      last_created_count: 1,
      paused: false,
    });
  });
});
