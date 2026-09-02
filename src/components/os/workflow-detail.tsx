import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import {
  EmptyNote,
  formatWhen,
  GlassCard,
  StatePill,
  toneForState,
} from "@/components/os/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type GraphNode = {
  key: string;
  kind: string;
  ref?: string;
  inputs?: Record<string, unknown>;
};

export type Graph = {
  nodes?: GraphNode[];
  edges?: { from: string; to: string; when?: string }[];
};

export type RunStep = {
  id: string;
  node_key: string;
  node_kind: string;
  ref: string | null;
  sequence: number;
  state: string;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  input: unknown;
  output: unknown;
};

export type Run = {
  id: string;
  state: string;
  created_at: string;
  duration_ms: number | null;
  trigger_source: string;
  error: string | null;
  cursor?: number | null;
  total_steps?: number | null;
  mode?: string | null;
  workflow_steps: RunStep[];
};

const ACTIVE_RUN_STATES = new Set(["queued", "running", "awaiting_approval"]);

export function findActiveRun(runs: Run[]): Run | null {
  return runs.find((run) => ACTIVE_RUN_STATES.has(run.state)) ?? null;
}

/**
 * Manual-first run controls. A run sits still at a position; the operator
 * moves it one step at a time and sees the result before continuing.
 */
export function RunControlCard({
  run,
  graph,
  canOperate,
  busy,
  onStart,
  onAdvance,
  onCancel,
}: {
  run: Run | null;
  graph: Graph;
  canOperate: boolean;
  busy: boolean;
  onStart: () => void;
  onAdvance: () => void;
  onCancel: () => void;
}) {
  const nodes = graph.nodes ?? [];
  const cursor = run?.cursor ?? 0;
  const total = run?.total_steps ?? nodes.length;
  const nextNode = run ? (nodes[cursor] ?? null) : null;
  const running = run?.state === "running";

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Run controls</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {run
              ? `Step ${Math.min(cursor + 1, Math.max(total, 1))} of ${total || nodes.length}. Nothing runs until you press it.`
              : "No run is open. Starting one parks it before the first step."}
          </p>
        </div>
        {run ? <StatePill label={run.state} tone={toneForState(run.state)} /> : null}
      </div>

      {run ? (
        <div className="mt-4 space-y-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
            <div
              className="h-full rounded-full bg-primary/70 transition-all"
              style={{ width: `${total > 0 ? Math.round((cursor / total) * 100) : 0}%` }}
            />
          </div>
          <p className="text-sm text-foreground">
            {nextNode
              ? `Next: ${humanize(nextNode.key)}`
              : "Every step in this run has been completed."}
          </p>
          {nextNode?.kind === "approval" ? (
            <p className="text-xs text-warning">
              This is a decision point. Advancing it records your approval and continues the same
              run.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {run ? (
          <>
            <Button
              variant="outline"
              disabled={!canOperate || busy || running || !nextNode}
              onClick={onAdvance}
            >
              {busy
                ? "Working"
                : nextNode?.kind === "approval"
                  ? "Approve and continue"
                  : "Run this step"}
            </Button>
            <Button variant="outline" disabled={!canOperate || busy} onClick={onCancel}>
              Cancel run
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={!canOperate || busy} onClick={onStart}>
            {busy ? "Starting" : "Start a step-by-step run"}
          </Button>
        )}
      </div>

      {!canOperate ? (
        <p className="mt-3 text-xs text-muted-foreground">
          You are signed in read only, so run controls are disabled.
        </p>
      ) : null}
    </GlassCard>
  );
}

export type CapabilityMeta = {
  key: string;
  name: string;
  kind: string;
  category: string | null;
  description: string | null;
  integration_state: string;
  health: string;
  last_run_at: string | null;
};

/** "collect_snapshots" / "dfs.labs" become readable step names. */
export function humanize(value: string) {
  const words = value.replaceAll(/[._-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const kindLabels: Record<string, string> = {
  capability: "Tool step",
  agent: "Agent step",
  approval: "Approval gate",
  condition: "Condition",
};

function formatJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function CodeBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-xl border border-border/60 bg-background/40 p-3 text-xs leading-relaxed text-foreground">
        {value}
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step side panel                                                     */
/* ------------------------------------------------------------------ */

export function StepDetailPanel({
  node,
  step,
  capability,
  graph,
  onOpenChange,
}: {
  node: GraphNode | null;
  step: RunStep | null;
  capability: CapabilityMeta | null;
  graph: Graph;
  onOpenChange: (open: boolean) => void;
}) {
  const declaredInputs = formatJson(node?.inputs);
  const stepInput = formatJson(step?.input);
  const stepOutput = formatJson(step?.output);

  const upstream = node
    ? (graph.edges ?? []).filter((edge) => edge.to === node.key).map((edge) => edge.from)
    : [];
  const downstream = node
    ? (graph.edges ?? []).filter((edge) => edge.from === node.key).map((edge) => edge.to)
    : [];

  return (
    <Sheet open={node !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {node ? (
          <>
            <SheetHeader>
              <SheetTitle>{humanize(node.key)}</SheetTitle>
              <SheetDescription>
                {kindLabels[node.kind] ?? humanize(node.kind)}
                {node.ref ? ` · ${node.ref}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {node.kind === "approval" ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
                  This step requires a human decision. The run parks here and an approval item is
                  filed to the Action Center. Continuation after approval is not automated yet, so
                  an operator restarts the workflow once the decision is recorded.
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Connected tool
                </p>
                {capability ? (
                  <div className="rounded-xl border border-border/60 bg-background/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to="/capabilities/$id"
                        params={{ id: capability.key }}
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {capability.name}
                      </Link>
                      <span className="flex items-center gap-2">
                        <StatePill
                          label={capability.integration_state}
                          tone={toneForState(capability.integration_state)}
                        />
                        <StatePill
                          label={capability.health}
                          tone={toneForState(capability.health)}
                        />
                      </span>
                    </div>
                    {capability.description ? (
                      <p className="mt-2 text-xs text-muted-foreground">{capability.description}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {capability.kind}
                      {capability.category ? ` · ${capability.category}` : ""} · last run{" "}
                      {formatWhen(capability.last_run_at)}
                    </p>
                  </div>
                ) : node.ref && node.kind === "agent" ? (
                  <p className="text-sm text-muted-foreground">
                    Agent <span className="text-foreground">{node.ref}</span>.{" "}
                    <Link to="/agents" className="text-primary underline-offset-4 hover:underline">
                      Open agents
                    </Link>
                  </p>
                ) : (
                  <EmptyNote>No tool is bound to this step.</EmptyNote>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Runs after
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {upstream.length > 0
                      ? upstream.map(humanize).join(", ")
                      : "Nothing (entry step)"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Hands off to
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {downstream.length > 0
                      ? downstream.map(humanize).join(", ")
                      : "Nothing (final step)"}
                  </p>
                </div>
              </div>

              {declaredInputs ? <CodeBlock label="Declared inputs" value={declaredInputs} /> : null}

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Latest recorded execution
                </p>
                {step ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatePill label={step.state} tone={toneForState(step.state)} />
                      <span className="text-xs text-muted-foreground">
                        {step.duration_ms !== null ? `${step.duration_ms} ms` : "no duration"} ·
                        started {formatWhen(step.started_at)}
                      </span>
                    </div>
                    {step.error ? <p className="text-sm text-destructive">{step.error}</p> : null}
                    {stepInput ? <CodeBlock label="Input" value={stepInput} /> : null}
                    {stepOutput ? <CodeBlock label="Output" value={stepOutput} /> : null}
                    {!stepInput && !stepOutput ? (
                      <EmptyNote>This step recorded no input or output payload.</EmptyNote>
                    ) : null}
                  </>
                ) : (
                  <EmptyNote>This step has not run yet.</EmptyNote>
                )}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Approval gate                                                       */
/* ------------------------------------------------------------------ */

export function ApprovalGateCard({
  graph,
  runs,
  operatorEmail,
  canApprove,
}: {
  graph: Graph;
  runs: Run[];
  operatorEmail: string | null;
  canApprove: boolean;
}) {
  const gates = (graph.nodes ?? []).filter((node) => node.kind === "approval");
  if (gates.length === 0) return null;

  const parked = runs.filter((run) => run.state === "awaiting_approval");

  return (
    <GlassCard className="p-5">
      <h2 className="text-sm font-semibold text-foreground">Approval gate</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This workflow cannot finish on its own. It stops at a human decision and waits.
      </p>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            What needs approval
          </dt>
          <dd className="mt-1 text-foreground">
            {gates.map((gate) => humanize(gate.key)).join(", ")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Who can approve
          </dt>
          <dd className="mt-1 text-foreground">
            Admins and provisioned operators.{" "}
            {canApprove ? (
              <span className="text-primary">
                You{operatorEmail ? ` (${operatorEmail})` : ""} can approve.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Your account is read only, so someone with operator access has to decide.
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            What happens after approval
          </dt>
          <dd className="mt-1 text-muted-foreground">
            The parked run is filed to the Action Center as a pending approval. Automatic
            continuation is not wired yet: once the decision is recorded, an operator starts the
            workflow again from the approved point. AOOS will not resume a run it cannot prove is
            safe to resume.
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link to="/">
          <Button variant="outline" size="sm">
            Open Action Center
          </Button>
        </Link>
        <span className="text-xs text-muted-foreground">
          {parked.length === 0
            ? "No run is currently parked at this gate."
            : `${parked.length} run${parked.length === 1 ? "" : "s"} parked awaiting a decision.`}
        </span>
      </div>
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/* Run history timeline                                                */
/* ------------------------------------------------------------------ */

const stateFilters = [
  { key: "all", label: "All" },
  { key: "succeeded", label: "Succeeded" },
  { key: "failed", label: "Failed" },
  { key: "awaiting_approval", label: "Awaiting approval" },
  { key: "running", label: "Running" },
] as const;

export function RunHistoryTimeline({
  runs,
  onInspectStep,
}: {
  runs: Run[];
  onInspectStep: (step: RunStep) => void;
}) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(runs[0]?.id ?? null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (state !== "all" && run.state !== state) return false;
      if (needle.length === 0) return true;
      const haystack = [
        run.state,
        run.trigger_source,
        run.error ?? "",
        ...run.workflow_steps.map(
          (step) => `${step.node_key} ${step.ref ?? ""} ${step.error ?? ""}`,
        ),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [runs, query, state]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    runs.forEach((run) => map.set(run.state, (map.get(run.state) ?? 0) + 1));
    return map;
  }, [runs]);

  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Run history</h2>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {runs.length} runs
        </span>
      </div>

      {runs.length === 0 ? (
        <EmptyNote className="mt-2">No runs recorded yet.</EmptyNote>
      ) : (
        <>
          <div className="mt-3 space-y-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search runs by step, trigger, or failure text"
              aria-label="Search run history"
            />
            <div className="flex flex-wrap gap-2">
              {stateFilters.map((filter) => {
                const count = filter.key === "all" ? runs.length : (counts.get(filter.key) ?? 0);
                const active = state === filter.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setState(filter.key)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      active
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {filter.label}
                    <span className="ml-1.5 text-[11px] opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyNote className="mt-4">No run matches this filter.</EmptyNote>
          ) : (
            <ol className="relative mt-4 space-y-4 pl-7">
              <span
                aria-hidden
                className="absolute left-[13px] top-3 bottom-3 w-px bg-gradient-to-b from-primary/40 via-border to-transparent"
              />
              {filtered.map((run) => {
                const steps = [...run.workflow_steps].sort((a, b) => a.sequence - b.sequence);
                const failedStep = steps.find((step) => step.state === "failed");
                const isOpen = expanded === run.id;
                return (
                  <li key={run.id} className="relative">
                    <span
                      aria-hidden
                      className={cn(
                        "absolute -left-7 top-4 size-[26px] rounded-full border bg-background",
                        run.state === "failed" ? "border-destructive/50" : "border-primary/40",
                      )}
                    />
                    <div className="rounded-xl border border-border/60 bg-background/30">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : run.id)}
                        aria-expanded={isOpen}
                        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
                      >
                        <StatePill label={run.state} tone={toneForState(run.state)} />
                        <span className="text-xs text-muted-foreground">
                          {formatWhen(run.created_at)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {run.duration_ms !== null ? `${run.duration_ms} ms` : "in progress"} ·{" "}
                          {run.trigger_source}
                        </span>
                        <span className="ml-auto text-xs text-primary">
                          {isOpen ? "Hide steps" : `${steps.length} steps`}
                        </span>
                      </button>

                      {run.error || failedStep ? (
                        <div className="mx-3 mb-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
                          <p className="text-xs uppercase tracking-[0.14em] text-destructive">
                            Failure summary
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            {failedStep
                              ? `Stopped at step ${failedStep.sequence + 1}, ${humanize(failedStep.node_key)}.`
                              : "The run reported a failure."}
                          </p>
                          <p className="mt-1 text-sm text-destructive">
                            {failedStep?.error ?? run.error}
                          </p>
                        </div>
                      ) : null}

                      {isOpen ? (
                        <ul className="mx-3 mb-3 space-y-1 rounded-xl border border-border/50 bg-background/25 p-2">
                          {steps.map((step) => (
                            <li key={step.id}>
                              <button
                                type="button"
                                onClick={() => onInspectStep(step)}
                                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-primary/5"
                              >
                                <span className="truncate text-muted-foreground">
                                  <span className="mr-2 text-xs text-primary/70">
                                    {step.sequence + 1}
                                  </span>
                                  {humanize(step.node_key)}
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {step.duration_ms !== null
                                      ? `${step.duration_ms} ms`
                                      : "not recorded"}
                                  </span>
                                  <StatePill label={step.state} tone={toneForState(step.state)} />
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </GlassCard>
  );
}
