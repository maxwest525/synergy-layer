import { useEffect, useState } from "react";

import { GlassCard, StatePill } from "./primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialToolArguments, toolUsesProjectId } from "@/lib/openseo/tool-arguments";
import type { OpenSeoMcpTool, OpenSeoToolClassification } from "@/lib/openseo/types";

type Tool = OpenSeoMcpTool & { classification: OpenSeoToolClassification };

type Invocation = {
  toolName: string;
  arguments: Record<string, unknown>;
  confirmed: boolean;
};

type Props = {
  tools: Tool[];
  projectId: string;
  onInvoke: (input: Invocation) => Promise<unknown>;
};

function parseArguments(input: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(input);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function toneFor(classification: OpenSeoToolClassification): "neutral" | "warning" | "danger" {
  if (classification.mode === "destructive") return "danger";
  if (classification.requiresConfirmation) return "warning";
  return "neutral";
}

function ToolCard({
  tool,
  projectId,
  onInvoke,
}: {
  tool: Tool;
  projectId: string;
  onInvoke: Props["onInvoke"];
}) {
  const [argumentsText, setArgumentsText] = useState(() =>
    JSON.stringify(initialToolArguments(tool, projectId), null, 2),
  );
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<{ result?: unknown; error?: string } | null>(null);

  useEffect(() => {
    if (toolUsesProjectId(tool)) {
      setArgumentsText(JSON.stringify(initialToolArguments(tool, projectId), null, 2));
    }
  }, [projectId, tool]);

  async function run(confirmed: boolean) {
    let argumentsObject: Record<string, unknown>;
    try {
      argumentsObject = parseArguments(argumentsText);
    } catch (error) {
      setOutcome({ error: error instanceof Error ? error.message : "Enter a JSON object." });
      return;
    }

    setPending(true);
    setOutcome(null);
    try {
      const result = await onInvoke({ toolName: tool.name, arguments: argumentsObject, confirmed });
      setOutcome({ result });
      setConfirming(false);
    } catch (error) {
      setOutcome({
        error: error instanceof Error ? error.message : "OpenSEO could not run this tool.",
      });
    } finally {
      setPending(false);
    }
  }

  const classification = tool.classification;
  return (
    <GlassCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-mono text-sm font-semibold text-foreground">{tool.name}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {tool.description ?? "No provider description was supplied."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatePill
            label={classification.mode.replaceAll("_", " ")}
            tone={toneFor(classification)}
          />
          <StatePill label={classification.cost} tone="neutral" />
        </div>
      </div>

      <label
        className="mt-4 block text-xs font-medium text-muted-foreground"
        htmlFor={`openseo-${tool.name}`}
      >
        Tool arguments (JSON)
      </label>
      <Textarea
        id={`openseo-${tool.name}`}
        rows={4}
        value={argumentsText}
        onChange={(event) => setArgumentsText(event.target.value)}
        className="mt-2 font-mono text-xs"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {classification.requiresConfirmation ? (
          confirming ? (
            <>
              <p className="w-full text-xs text-amber-300">
                This {classification.mode.replaceAll("_", " ")} can use credits or change OpenSEO
                state. Confirm to run it once.
              </p>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(true)}>
                {pending ? "Running…" : "Confirm and run"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              Review governed call
            </Button>
          )
        ) : (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(false)}>
            {pending ? "Running…" : "Run free read"}
          </Button>
        )}
      </div>

      {outcome?.error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {outcome.error}
        </p>
      ) : null}
      {outcome?.result !== undefined ? (
        <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border/60 bg-background/60 p-3 text-xs text-muted-foreground">
          {JSON.stringify(outcome.result, null, 2)}
        </pre>
      ) : null}
    </GlassCard>
  );
}

export function OpenSeoToolRunner({ tools, projectId, onInvoke }: Props) {
  return (
    <section className="space-y-4" aria-label="OpenSEO tools">
      {tools.map((tool) => (
        <ToolCard key={tool.name} tool={tool} projectId={projectId} onInvoke={onInvoke} />
      ))}
    </section>
  );
}
