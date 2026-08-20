import { createFileRoute } from "@tanstack/react-router";

import { GettingFoundPage } from "@/components/os/getting-found-page";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/search/")({
  // Operator-only workspace: rendering it server side without the operator
  // bearer token produced an empty tree the client immediately replaced.
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Getting found on Google · Marky" },
      {
        name: "description",
        content:
          "Whether people can find you in search, what is actually holding you back, and what to fix so more of them do.",
      },
    ],
  }),
  component: GettingFoundPage,
});
