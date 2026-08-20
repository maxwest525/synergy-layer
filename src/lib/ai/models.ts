import type { ModelRole } from "./routing";

/**
 * The models an operator may pick in the composer. The browser can only ever
 * name one of these ids; the server maps the choice back to a real model, so a
 * tampered request cannot reach an arbitrary model.
 */
export const AGENT_MODEL_CHOICES = [
  { id: "auto", label: "Auto", role: "reasoning" },
  { id: "reasoning", label: "Deep reasoning", role: "reasoning" },
  { id: "fast", label: "Fast", role: "fast" },
] as const satisfies readonly { id: string; label: string; role: ModelRole }[];

export type AgentModelChoice = (typeof AGENT_MODEL_CHOICES)[number]["id"];

/**
 * Resolve an untrusted choice id to a role, falling back to the default.
 *
 * A role rather than a model name, because the model behind it is whatever the
 * proxy is configured to call it. Hardcoding a slug here would break the moment
 * the proxy used its own alias, and the browser would still only ever name one
 * of these ids, so a tampered request still cannot reach an arbitrary model.
 */
export function resolveAgentRole(choice: unknown): ModelRole {
  const match = AGENT_MODEL_CHOICES.find((entry) => entry.id === choice);
  return (match ?? AGENT_MODEL_CHOICES[0]).role;
}

/** Extra system guidance for the optional composer modes. */
export function modeInstruction(mode: unknown): string {
  if (mode === "search") {
    return "\n\nThe operator asked you to look beyond stored evidence. You may draw on general public knowledge, but label every such statement clearly as unverified background, never as a stored fact, and say which workspace would hold the evidence that would confirm it.";
  }
  if (mode === "think") {
    return "\n\nThe operator asked for deeper reasoning. Work the problem through step by step before answering, state your assumptions, and name what would change your conclusion.";
  }
  return "";
}
