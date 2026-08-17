import { Outlet, createFileRoute } from "@tanstack/react-router";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/knowledge")({
  errorComponent: OperatorRouteError,
  component: () => <Outlet />,
});
