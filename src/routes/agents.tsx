import { Outlet, createFileRoute } from "@tanstack/react-router";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/agents")({
  errorComponent: OperatorRouteError,
  component: () => <Outlet />,
});
