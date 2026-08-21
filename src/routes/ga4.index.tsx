import { createFileRoute } from "@tanstack/react-router";

import { VisitorsPage } from "@/components/os/visitors-page";
import { OperatorRouteError } from "@/components/os/route-error";

/**
 * The "Who visits your site" category front door.
 *
 * The GA4 connection state, the run diagnostics and the stored snapshot list
 * that used to live at this address are unchanged at /ga4/tools; this page
 * answers the operator's question rather than the developer's.
 */
export const Route = createFileRoute("/ga4/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Who visits your site — Marky" },
      {
        name: "description",
        content:
          "How many people came, what they did once they arrived, and which questions this much traffic can answer.",
      },
    ],
  }),
  errorComponent: OperatorRouteError,
  component: VisitorsPage,
});
