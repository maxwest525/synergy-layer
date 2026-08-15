import { createServerFn } from "@tanstack/react-start";

export const getGovernedKnowledge = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchGovernedKnowledge } = await import("./queries.server");
  return fetchGovernedKnowledge();
});

export const getExecutionManual = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchExecutionManual } = await import("./queries.server");
  return fetchExecutionManual();
});
