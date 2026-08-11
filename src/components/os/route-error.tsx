import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/os/primitives";
import { Button } from "@/components/ui/button";

/**
 * Operator surfaces fail in one of two ways: the operator session expired, so
 * the server function was called without a bearer token, or the read itself
 * broke. The first one is recoverable by signing in again, so say that plainly
 * instead of letting the root boundary show a blank screen.
 */
export function OperatorRouteError({ error }: { error: Error }) {
  const message = error.message ?? "";
  const signedOut = /unauthorized|no authorization header|jwt|401/i.test(message);

  if (signedOut) {
    return (
      <EmptyState
        title="Your operator session expired"
        description="Sign in again to load this workspace. Nothing was changed."
        action={
          <Button variant="outline" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      title="This workspace could not load"
      description={message || "The read failed. Try again in a moment."}
      action={
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      }
    />
  );
}
