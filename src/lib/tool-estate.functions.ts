import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getToolEstate = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchToolEstate } = await import("./tool-estate.server");
  return fetchToolEstate();
});

export const getToolSystem = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ key: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const { fetchToolSystem } = await import("./tool-estate.server");
    return fetchToolSystem(data.key);
  });
