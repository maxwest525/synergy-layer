import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tenant.server", () => ({
  requireTenantId: vi.fn().mockResolvedValue("tenant-1"),
  resolveTenantId: vi.fn().mockResolvedValue("tenant-1"),
}));

type Write = { table: string; kind: "insert" | "update"; value: unknown };

function fakeClient(options: { agentRequiresApproval?: boolean; workflowHasApproval?: boolean }) {
  const writes: Write[] = [];
  let nextRunId = 0;
  let nextStepId = 0;

  const client = {
    from(table: string) {
      const state: { operation?: "select" | "insert" | "update"; value?: unknown } = {};
      const result = () => {
        if (table === "agent_capabilities") return { data: [], error: null };
        return { data: null, error: null };
      };
      const builder = {
        select() {
          state.operation = "select";
          return builder;
        },
        insert(value: unknown) {
          state.operation = "insert";
          state.value = value;
          writes.push({ table, kind: "insert", value });
          return builder;
        },
        update(value: unknown) {
          state.operation = "update";
          state.value = value;
          writes.push({ table, kind: "update", value });
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          if (table === "agents") {
            return {
              data: {
                id: "agent-1",
                name: "Content Strategist",
                permissions: { requiresApproval: options.agentRequiresApproval ?? false },
              },
              error: null,
            };
          }
          if (table === "workflows") {
            return {
              data: {
                id: "workflow-1",
                name: "Content generation",
                graph: options.workflowHasApproval
                  ? { nodes: [{ key: "review", kind: "approval" }], edges: [] }
                  : { nodes: [], edges: [] },
              },
              error: null,
            };
          }
          return result();
        },
        async single() {
          if (table === "workflow_runs") return { data: { id: `run-${++nextRunId}` }, error: null };
          if (table === "workflow_steps")
            return { data: { id: `step-${++nextStepId}` }, error: null };
          return result();
        },
        then(resolve: (value: unknown) => void) {
          resolve(result());
        },
      };
      return builder;
    },
  };

  return { client, writes };
}

describe("approval requests in the Action Center", () => {
  beforeEach(() => vi.clearAllMocks());

  it("files an agent approval request in the pending-approval lane", async () => {
    const { runAgent } = await import("./agent-runtime.server");
    const { client, writes } = fakeClient({ agentRequiresApproval: true });

    await runAgent(client as never, "agent-1", "operator-1");

    expect(
      writes.find((write) => write.table === "inbox_items" && write.kind === "insert")?.value,
    ).toMatchObject({
      lane: "pending_approval",
      subject_kind: "agent",
      subject_id: "agent-1",
    });
  });

  it("files a workflow approval request in the pending-approval lane", async () => {
    const { runWorkflow } = await import("./workflow-runner.server");
    const { client, writes } = fakeClient({ workflowHasApproval: true });

    await runWorkflow(client as never, "workflow-1", "manual", "operator-1");

    expect(
      writes.find((write) => write.table === "inbox_items" && write.kind === "insert")?.value,
    ).toMatchObject({
      lane: "pending_approval",
      subject_kind: "workflow_run",
      subject_id: "run-1",
    });
  });
});
