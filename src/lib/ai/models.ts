/**
 * The models an operator may pick in the composer. The browser can only ever
 * name one of these ids; the server maps the choice back to a real model, so a
 * tampered request cannot reach an arbitrary model.
 */
export const AGENT_MODEL_CHOICES = [
  { id: "auto", label: "Auto", model: "google/gemini-3.1-pro-preview" },
  { id: "reasoning", label: "Deep reasoning", model: "google/gemini-3.1-pro-preview" },
  { id: "fast", label: "Fast", model: "google/gemini-3.6-flash" },
] as const;

export type AgentModelChoice = (typeof AGENT_MODEL_CHOICES)[number]["id"];

/** Resolve an untrusted choice id to a model, falling back to the default. */
export function resolveAgentModel(choice: unknown): string {
  const match = AGENT_MODEL_CHOICES.find((entry) => entry.id === choice);
  return (match ?? AGENT_MODEL_CHOICES[0]).model;
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
