import { createFileRoute } from "@tanstack/react-router";

import { YourPagesPage } from "@/components/os/your-pages-page";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/pages/")({
  // Operator-only workspace: rendering it server side without the operator
  // bearer token produced an empty tree the client immediately replaced.
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Your pages · Marky" },
      {
        name: "description",
        content:
          "Every page on your site, what is wrong with it, which one is worth fixing first, and the fix waiting for you.",
      },
    ],
  }),
  component: YourPagesPage,
});
