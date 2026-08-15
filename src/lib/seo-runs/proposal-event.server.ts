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
