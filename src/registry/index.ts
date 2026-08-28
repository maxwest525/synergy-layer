import type { ModuleDefinition } from "./types";

// The negative pattern is load-bearing: tests live beside the code they cover
// everywhere in this repo, and an eager glob without it sweeps any
// modules/*.test.ts into the production server bundle, where vitest's
// describe() runs at module load with no test runner and every SSR route dies
// with a 500. That is not hypothetical: self-hosted-analytics.test.ts took the
// deployed app down on 2026-08-28. Discovery stays convention-based; test
// files are simply not modules.
const modules = import.meta.glob<{ definition: ModuleDefinition }>(
  ["./modules/*.ts", "!./modules/*.test.ts"],
  { eager: true },
);

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
