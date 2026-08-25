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

  return (
    <div className="space-y-4">
      <EmptyState
        gapless
        title={signedOut ? "Your operator session expired" : "This workspace could not load"}
        description={
          signedOut
            ? "Sign in again to load this workspace. Nothing was changed."
            : message || "The read failed. Try again in a moment."
        }
      />
      <div className="flex justify-center">
        {signedOut ? (
          <Button variant="outline" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
        ) : (
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
