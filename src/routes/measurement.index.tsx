import { createFileRoute } from "@tanstack/react-router";

import { SiteHealthPage } from "@/components/os/site-health-page";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/measurement/")({
  // Operator-only workspace: rendering it server side without the operator
  // bearer token produced an empty tree the client immediately replaced.
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Site health · Marky" },
      {
        name: "description",
        content:
          "Whether your site loads fast, whether Google can read it, and whether the fixes you approved actually worked.",
      },
    ],
  }),
  component: SiteHealthPage,
});
