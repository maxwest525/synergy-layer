import { Outlet, createFileRoute } from "@tanstack/react-router";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/scheduler")({
  errorComponent: OperatorRouteError,
  component: () => <Outlet />,
});
