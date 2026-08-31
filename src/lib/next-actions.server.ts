import { generateText } from "ai";

import { createGateway, fastModel } from "./ai/gateway.server";
import type { NextAction } from "./next-actions";

export type PrioritizedAction = {
  id: string;
  /** The agent's plain-language rewrite of the reason. Never a new fact. */
  reason: string;
};

export type Prioritization = {
  orderedIds: string[];
  rewritten: PrioritizedAction[];
  note: string;
  decidedAt: string;
};

const SYSTEM = `You prioritise operator work for a marketing operating system.

You receive a list of candidate actions that were generated from stored evidence. You may only reorder them and reword their reason. You must never invent an action, a number, a provider result, or a claim that is not in the candidate text you were given. If you are unsure, keep the original order.

Answer with JSON only, in this exact shape:
{"orderedIds":["id","id"],"rewritten":[{"id":"id","reason":"one plain sentence"}],"note":"one sentence explaining the ordering"}`;

function parse(text: string): { orderedIds: unknown; rewritten: unknown; note: unknown } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as {
      orderedIds: unknown;
      rewritten: unknown;
      note: unknown;
    };
  } catch {
    return null;
  }
}

/**
 * Optional agent pass over the deterministic actions. The model can only
 * choose among ids that already exist, so a hallucinated action is dropped
 * rather than shown, and the deterministic order survives any failure.
 *
 * Uses the fast model, not reasoning: reordering an existing short list and
 * rewording each reason in one plain sentence is bounded, constrained-output
 * work with a safe fallback on any failure, not a task that benefits from a
 * larger model's depth.
 */
export async function prioritizeActions(actions: NextAction[]): Promise<Prioritization> {
  const known = new Set(actions.map((action) => action.id));
  const fallback: Prioritization = {
    orderedIds: actions.map((action) => action.id),
    rewritten: [],
    note: "The agent could not be reached, so the deterministic order from stored evidence is shown.",
    decidedAt: new Date().toISOString(),
  };
  if (actions.length === 0) return { ...fallback, note: "There is nothing to prioritise." };

  try {
    const gateway = createGateway();
    const result = await generateText({
      model: gateway(fastModel()),
      system: SYSTEM,
      prompt: JSON.stringify(
        actions.map((action) => ({
          id: action.id,
          group: action.group,
          title: action.title,
          reason: action.reason,
          evidence: action.evidence,
          blockedBy: action.blockedBy,
        })),
      ),
    });
    const parsed = parse(result.text);
    if (!parsed) return fallback;

    const ordered = Array.isArray(parsed.orderedIds)
      ? parsed.orderedIds.filter((id): id is string => typeof id === "string" && known.has(id))
      : [];
    for (const action of actions) if (!ordered.includes(action.id)) ordered.push(action.id);

    const rewritten = Array.isArray(parsed.rewritten)
      ? parsed.rewritten
          .filter(
            (entry): entry is { id: string; reason: string } =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as { id?: unknown }).id === "string" &&
              known.has((entry as { id: string }).id) &&
              typeof (entry as { reason?: unknown }).reason === "string",
          )
          .map((entry) => ({ id: entry.id, reason: entry.reason }))
      : [];

    return {
      orderedIds: ordered,
      rewritten,
      note: typeof parsed.note === "string" ? parsed.note : "Reordered by the agent.",
      decidedAt: new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
}
