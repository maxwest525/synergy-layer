import { Outlet, createFileRoute } from "@tanstack/react-router";
import { OperatorRouteError } from "@/components/os/route-error";

export const Route = createFileRoute("/recommendations")({
  errorComponent: OperatorRouteError,
  component: () => <Outlet />,
});
