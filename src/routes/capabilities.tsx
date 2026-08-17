import { Outlet, createFileRoute } from "@tanstack/react-router";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/capabilities")({
  errorComponent: OperatorRouteError,
  component: () => <Outlet />,
});
