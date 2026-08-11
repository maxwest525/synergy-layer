import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const idInput = (data: unknown) => z.object({ id: z.string().uuid() }).parse(data);

export const getInbox = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchInbox } = await import("./os-queries.server");
  return fetchInbox();
});

export const getOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchOverview } = await import("./os-queries.server");
  return fetchOverview();
});

export const getAssets = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAssets } = await import("./os-queries.server");
  return fetchAssets();
});

export const getAsset = createServerFn({ method: "GET" })
  .inputValidator(idInput)
  .handler(async ({ data }) => {
    const { fetchAsset } = await import("./os-queries.server");
    return fetchAsset(data.id);
  });

export const getCapabilities = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchCapabilities } = await import("./os-queries.server");
  return fetchCapabilities();
});

export const getCapability = createServerFn({ method: "GET" })
  // Capabilities are addressable by uuid or registry key, so no uuid constraint here.
  .inputValidator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { fetchCapability } = await import("./os-queries.server");
    return fetchCapability(data.id);
  });

export const getKnowledge = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchKnowledge } = await import("./os-queries.server");
  return fetchKnowledge();
});

export const getKnowledgeCollection = createServerFn({ method: "GET" })
  .inputValidator(idInput)
  .handler(async ({ data }) => {
    const { fetchKnowledgeCollection } = await import("./os-queries.server");
    return fetchKnowledgeCollection(data.id);
  });

export const getAgents = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchAgents } = await import("./os-queries.server");
  return fetchAgents();
});

export const getAgent = createServerFn({ method: "GET" })
  .inputValidator(idInput)
  .handler(async ({ data }) => {
    const { fetchAgent } = await import("./os-queries.server");
    return fetchAgent(data.id);
  });

export const getWorkflows = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchWorkflows } = await import("./os-queries.server");
  return fetchWorkflows();
});

export const getWorkflow = createServerFn({ method: "GET" })
  .inputValidator(idInput)
  .handler(async ({ data }) => {
    const { fetchWorkflow } = await import("./os-queries.server");
    return fetchWorkflow(data.id);
  });

export const getRecommendations = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchRecommendations } = await import("./os-queries.server");
  return fetchRecommendations();
});

export const getRecommendation = createServerFn({ method: "GET" })
  .inputValidator(idInput)
  .handler(async ({ data }) => {
    const { fetchRecommendation } = await import("./os-queries.server");
    return fetchRecommendation(data.id);
  });

export const getSchedules = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchSchedules } = await import("./os-queries.server");
  return fetchSchedules();
});

export const getSchedule = createServerFn({ method: "GET" })
  .inputValidator(idInput)
  .handler(async ({ data }) => {
    const { fetchSchedule } = await import("./os-queries.server");
    return fetchSchedule(data.id);
  });
