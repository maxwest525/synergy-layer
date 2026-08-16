import type { ReactNode } from "react";

/**
 * Shown while a workspace is still fetching. It keeps page structure on screen
 * so navigation reads as instant instead of as a frozen previous page.
 */
export function RoutePending() {
  return (
    <div className="space-y-8" role="status" aria-busy="true" aria-label="Loading workspace">
      <div className="space-y-3 border-b border-border/60 pb-6">
        <Bar className="h-3 w-32" />
        <Bar className="h-7 w-64" />
        <Bar className="h-3 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="rounded-2xl border border-border/70 bg-card/40 p-5">
            <Bar className="h-3 w-20" />
            <Bar className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((key) => (
          <div key={key} className="rounded-2xl border border-border/70 bg-card/40 p-4">
            <Bar className="h-3 w-40" />
            <Bar className="mt-3 h-3 w-full max-w-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ className }: { className: string }): ReactNode {
  return <div aria-hidden className={`animate-pulse rounded-md bg-muted/60 ${className}`} />;
}
