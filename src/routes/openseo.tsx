import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { OpenSeoToolRunner } from "@/components/os/openseo-tool-runner";
import {
  EmptyState,
  GlassCard,
  PageHeader,
  StatePill,
  formatWhen,
  toneForState,
} from "@/components/os/primitives";
import { OperatorRouteError } from "@/components/os/route-error";
import { Input } from "@/components/ui/input";
import { getOpenSeoWorkspace, invokeOpenSeoTool } from "@/lib/openseo/functions";
import type { OpenSeoMcpTool, OpenSeoToolClassification } from "@/lib/openseo/types";

export const Route = createFileRoute("/openseo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "OpenSEO — AOOS" },
      {
        name: "description",
        content:
          "Live OpenSEO tools from the connected self-hosted MCP server, with tenant-scoped invocation evidence and explicit confirmation for governed work.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: OpenSeoPage,
});

type Tool = OpenSeoMcpTool & { classification: OpenSeoToolClassification };
type HistoryRow = {
  id: string;
  tool_name: string;
  classification: string;
  cost_model: string;
  status: string;
  error_code: string | null;
  credits_charged: number | null;
  credits_remaining: number | null;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  created_at: string;
};
type Workspace = {
  tenantId: string;
  server: { name: string; version: string };
  protocolVersion: string;
  instructions: string | null;
  tools: Tool[];
  history: HistoryRow[];
};

function asWorkspace(value: unknown): Workspace {
  return value as Workspace;
}

function OpenSeoPage() {
  const loadWorkspace = useServerFn(getOpenSeoWorkspace);
  const invoke = useServerFn(invokeOpenSeoTool);
  const queryClient = useQueryClient();
  const { data: rawWorkspace } = useSuspenseQuery({
    queryKey: ["openseo-workspace"],
    queryFn: () => loadWorkspace(),
    retry: false,
  });
  const workspace = asWorkspace(rawWorkspace);
  const [projectId, setProjectId] = useState("");
  const execution = useMutation({
    mutationFn: (input: {
      toolName: string;
      arguments: Record<string, unknown>;
      confirmed: boolean;
    }) => invoke({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["openseo-workspace"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Self-hosted SEO runtime"
        title="OpenSEO"
        description="The live tool catalog comes from your OpenSEO MCP server each time this workspace loads. Free reads run once. Any operation with a cost, a state change, or uncertain metadata requires a second confirmation."
      />

      <GlassCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              Live catalog
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {workspace.server.name} {workspace.server.version} · MCP {workspace.protocolVersion}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tenant {workspace.tenantId} · {workspace.tools.length} discovered tool
              {workspace.tools.length === 1 ? "" : "s"}
            </p>
          </div>
          <StatePill label="catalog loaded" tone="positive" />
        </div>
        {workspace.instructions ? (
          <p className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
            {workspace.instructions}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          SAM, Google Search Console, and GA4 are not inferred from the catalog. Their live
          connection state is verified separately before AOOS reports them as usable.
        </p>
      </GlassCard>

      <GlassCard className="p-5">
        <label htmlFor="openseo-project-id" className="text-sm font-semibold text-foreground">
          Selected OpenSEO project ID
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. AOOS prefills this only for tools whose live schema asks for a project ID. It is
          not sent until you run that tool.
        </p>
        <Input
          id="openseo-project-id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          className="mt-3 max-w-xl font-mono"
          placeholder="Paste an OpenSEO project ID"
        />
      </GlassCard>

      {workspace.tools.length === 0 ? (
        <EmptyState
          title="OpenSEO returned no tools"
          description="The MCP server connected but did not expose a tool catalog. AOOS will not invent a capability list."
        />
      ) : (
        <OpenSeoToolRunner
          tools={workspace.tools}
          projectId={projectId}
          onInvoke={(input) => execution.mutateAsync(input)}
        />
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Invocation history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenant-scoped, append-only evidence for calls made through AOOS.
          </p>
        </div>
        {workspace.history.length === 0 ? (
          <EmptyState
            title="No OpenSEO calls recorded"
            description="Running a tool from this workspace records its result, timing, provider version, and any reported credits."
          />
        ) : (
          <div className="space-y-2">
            {workspace.history.map((run) => (
              <GlassCard key={run.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{run.tool_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {run.classification.replaceAll("_", " ")} · {run.cost_model} ·{" "}
                      {formatWhen(run.created_at)} · {run.duration_ms}ms
                    </p>
                  </div>
                  <StatePill label={run.status} tone={toneForState(run.status)} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Charged: {run.credits_charged ?? "not reported"} · Remaining:{" "}
                  {run.credits_remaining ?? "not reported"}
                  {run.error_code ? ` · ${run.error_code}` : ""}
                </p>
              </GlassCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
