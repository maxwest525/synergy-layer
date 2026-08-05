import { useQuery } from "@tanstack/react-query";

import { GlassCard, StatePill, formatWhen, toneForState } from "@/components/os/primitives";
import { getMcpStatus } from "@/lib/mcp-status.functions";

/** MCP health and active OAuth grants for the agent integrations capability. */
export function McpPanel() {
  const { data, isPending, error } = useQuery({
    queryKey: ["mcp-status"],
    queryFn: () => getMcpStatus(),
  });

  if (isPending) {
    return (
      <GlassCard className="p-5">
        <p className="text-sm text-muted-foreground">Reading MCP health.</p>
      </GlassCard>
    );
  }

  if (error || !data) {
    return (
      <GlassCard className="p-5">
        <p className="text-sm text-destructive">MCP health could not be read right now.</p>
      </GlassCard>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard glow className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">MCP health</h2>
          <StatePill label={data.health} tone={toneForState(data.health)} />
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Endpoint</dt>
            <dd className="text-foreground">{data.endpoint}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Auth</dt>
            <dd className="text-foreground">{data.authType}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Surface</dt>
            <dd className="text-foreground">
              {data.tools.length} tools, {data.readOnly ? "read only" : "includes write tools"}
            </dd>
          </div>
        </dl>
        <ul className="mt-4 flex flex-wrap gap-2">
          {data.tools.map((tool) => (
            <li key={tool.name}>
              <StatePill label={tool.name} tone={tool.readOnly ? "success" : "warning"} />
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-foreground">Active OAuth grants</h2>
        {data.grants.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No client has called AOOS over MCP yet. Grants appear here after the first authorised tool call.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.grants.map((grant) => (
              <li key={grant.clientId} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{grant.clientId}</span>
                  <StatePill
                    label={grant.lastOutcome ?? "unknown"}
                    tone={toneForState(grant.lastOutcome === "succeeded" ? "healthy" : "degraded")}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {grant.operators.join(", ") || "unidentified operator"} — {grant.calls} calls, {grant.denied} denied,
                  last {grant.lastTool ?? "call"} {formatWhen(grant.lastCallAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold text-foreground">Recent tool calls</h2>
        {data.recentCalls.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No MCP tool calls recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {data.recentCalls.map((call, index) => (
              <li key={`${call.at}-${index}`} className="flex flex-wrap justify-between gap-3">
                <span className="text-foreground">
                  {call.tool} — {call.operator}
                </span>
                <span className="text-muted-foreground">
                  {call.clientId} · {call.outcome}
                  {call.durationMs === null ? "" : ` · ${call.durationMs} ms`} · {formatWhen(call.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
