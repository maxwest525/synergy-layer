import { createServerFn } from "@tanstack/react-start";

export const getConnectorReadiness = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchConnectorReadiness } = await import("./connections.server");
  return fetchConnectorReadiness();
});

export const checkConnectorReadiness = createServerFn({ method: "POST" }).handler(async () => {
  const { checkAllConnectorReadiness } = await import("./connections.server");
  return checkAllConnectorReadiness();
});

