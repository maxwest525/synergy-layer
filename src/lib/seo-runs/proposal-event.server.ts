export const SEO_PROPOSAL_EVENT_SUMMARY =
  "Evidence and Authority Science produced a concrete proposal awaiting operator approval.";

type ProposalEventInsert = {
  tenant_id: string;
  run_id: string;
  event_key: string;
  state: "awaiting_approval";
  summary: string;
  payload: {
    change_request_id: string;
    authority_finding_ids: string[];
    knowledge_chunk_ids: string[];
  };
  actor_id: string;
  occurred_at: string;
};

type ProposalEventUpsertOptions = {
  onConflict: "tenant_id,run_id,event_key";
  ignoreDuplicates: true;
};

type ProposalEventWriteResult = {
  error: { message: string } | null;
};

export type ProposalEventAdminClient = {
  from(table: "seo_run_events"): {
    upsert(
      event: ProposalEventInsert,
      options: ProposalEventUpsertOptions,
    ): PromiseLike<ProposalEventWriteResult>;
  };
};

export type LinkedSeoRun = {
  id: string;
  change_request_id: string;
  authority_finding_ids: string[];
  knowledge_chunk_ids: string[];
  started_at: string | null;
  updated_at: string;
};

type FailedLinkedSeoRun = LinkedSeoRun & { state: string };

export type ProposalRepairAdminClient = {
  from(table: "seo_run_events" | "seo_runs"): {
    upsert?: (
      event: ProposalEventInsert,
      options: ProposalEventUpsertOptions,
    ) => PromiseLike<ProposalEventWriteResult>;
    update?: (values: { state: "awaiting_approval"; failure_reason: null }) => {
      eq(
        column: "tenant_id",
        value: string,
      ): {
        eq(
          column: "id",
          value: string,
        ): {
          eq(
            column: "state",
            value: "failed",
          ): {
            eq(
              column: "change_request_id",
              value: string,
            ): {
              eq(
                column: "updated_at",
                value: string,
              ): {
                select(columns: "id"): {
                  maybeSingle(): PromiseLike<{
                    data: { id: string } | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    };
  };
};

type ProposalEventRepairAssessment = {
  run: FailedLinkedSeoRun;
  eventKeys: readonly string[];
  changeRequestState: string | null;
};

export function assessSeoRunProposalEventRepair({
  run,
  eventKeys,
  changeRequestState,
}: ProposalEventRepairAssessment): boolean {
  const proposalEventKey = `proposal:${run.change_request_id}`;
  const hasExecutionHistory = eventKeys.some(
    (key) => key.startsWith("execution_started:") || key.startsWith("source_execution:"),
  );
  return (
    run.state === "failed" &&
    Boolean(run.change_request_id) &&
    changeRequestState === "proposed" &&
    !eventKeys.includes(proposalEventKey) &&
    !hasExecutionHistory
  );
}

type ReconcileSeoRunProposalEventInput = {
  run: LinkedSeoRun;
  tenantId: string;
  actorId: string;
  admin: ProposalEventAdminClient;
};

export async function reconcileSeoRunProposalEvent({
  run,
  tenantId,
  actorId,
  admin,
}: ReconcileSeoRunProposalEventInput): Promise<void> {
  const { error } = await admin.from("seo_run_events").upsert(
    {
      tenant_id: tenantId,
      run_id: run.id,
      event_key: `proposal:${run.change_request_id}`,
      state: "awaiting_approval",
      summary: SEO_PROPOSAL_EVENT_SUMMARY,
      payload: {
        change_request_id: run.change_request_id,
        authority_finding_ids: run.authority_finding_ids,
        knowledge_chunk_ids: run.knowledge_chunk_ids,
      },
      actor_id: actorId,
      occurred_at: run.started_at ?? run.updated_at,
    },
    { onConflict: "tenant_id,run_id,event_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function repairFailedSeoRunProposalEvent({
  run,
  eventKeys,
  changeRequestState,
  tenantId,
  actorId,
  admin,
}: {
  run: FailedLinkedSeoRun;
  eventKeys: readonly string[];
  changeRequestState: string | null;
  tenantId: string;
  actorId: string;
  admin: ProposalRepairAdminClient;
}): Promise<"repaired" | "noop"> {
  if (!assessSeoRunProposalEventRepair({ run, eventKeys, changeRequestState })) return "noop";
  await reconcileSeoRunProposalEvent({
    run,
    tenantId,
    actorId,
    admin: admin as ProposalEventAdminClient,
  });
  const { data, error } = await admin.from("seo_runs").update!({
    state: "awaiting_approval",
    failure_reason: null,
  })
    .eq("tenant_id", tenantId)
    .eq("id", run.id)
    .eq("state", "failed")
    .eq("change_request_id", run.change_request_id)
    .eq("updated_at", run.updated_at)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? "repaired" : "noop";
}
