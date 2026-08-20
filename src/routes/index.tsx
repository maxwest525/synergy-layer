import { createFileRoute } from "@tanstack/react-router";

import { CommandCenterPage } from "@/components/os/command-center-page";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/")({
  // Operator-only workspace: nothing here is public, and rendering it on the
  // server without the operator bearer token produced an empty tree that the
  // client immediately replaced. Render it client side and skip that mismatch.
  ssr: false,
  errorComponent: OperatorRouteError,
  head: () => ({
    meta: [
      { title: "Marky" },
      {
        name: "description",
        content:
          "The Command center: what needs you first across search, your pages, your visitors and your connections, with nothing changing without your approval.",
      },
    ],
  }),
  component: CommandCenterPage,
});
