import type { ModuleDefinition } from "./types";

const modules = import.meta.glob<{ definition: ModuleDefinition }>("./modules/*.ts", {
  eager: true,
});

/** Every module definition discovered on disk — no hardcoded registry list. */
export const moduleDefinitions: ModuleDefinition[] = Object.values(modules)
  .map((entry) => entry.definition)
  .filter(Boolean)
  .sort((a, b) => a.module.localeCompare(b.module));

export function allCapabilities() {
  return moduleDefinitions.flatMap((module) => module.capabilities ?? []);
}

export function allAgents() {
  return moduleDefinitions.flatMap((module) => module.agents ?? []);
}

export function allWorkflows() {
  return moduleDefinitions.flatMap((module) => module.workflows ?? []);
}
