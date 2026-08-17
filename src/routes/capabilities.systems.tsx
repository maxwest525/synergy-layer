import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Pass-through layout for the systems area. Without it the systems index route
 * is generated with a trailing-slash path, which makes the route tree rebuild
 * non-idempotently and throws "Duplicate routes found with id: /" on the
 * second router build in a session.
 */
export const Route = createFileRoute("/capabilities/systems")({
  component: () => <Outlet />,
});
