import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/capabilities/systems")({
  errorComponent: OperatorRouteError,
  component: () => <Outlet />,
});
