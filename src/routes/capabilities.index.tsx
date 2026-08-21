import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsPage } from "@/components/os/connections-page";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/capabilities/")({
  // Operator-only workspace: rendering it server side without the operator
  // bearer token produced an empty tree the client immediately replaced.
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Connections · Marky" },
      {
        name: "description",
        content:
          "The accounts this system reads from, whether each one has stored anything, and whether any of it ever reaches you.",
      },
    ],
  }),
  component: ConnectionsPage,
});
