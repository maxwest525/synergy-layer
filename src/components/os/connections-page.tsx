import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plug, TriangleAlert } from "lucide-react";

import { EmptyState } from "./primitives";
import { useOperatorSession } from "@/hooks/use-operator-session";
import { buildConnections, type ConnectionRow, type ConnectionStage } from "@/lib/connections";
import { getConnectionFacts } from "@/lib/connections.functions";
import { cn } from "@/lib/utils";

/**
 * Connections.
 *
 * The page that answers "why is nothing coming out of all these accounts I set
 * up". Its subject is not whether a credential is present, which the capability
 * registry has always shown, but whether anything a connection collects ever
 * reaches the operator.
 *
 * Nothing here writes, and nothing here calls a provider. Every number is a
 * count of stored rows.
 */

const STAGE_TONE: Record<ConnectionStage, string> = {
  // Collecting in silence is the loud one: it is the state that may be costing
  // money on every run while producing nothing.
  collecting: "text-destructive",
  configured: "text-warning",
  not_configured: "text-subtle",
  reaching_you: "text-primary",
};

const STAGE_LABEL: Record<ConnectionStage, string> = {
  collecting: "Collecting, reaching nobody",
  configured: "Set up, never run",
  not_configured: "Not set up",
  reaching_you: "Reaching you",
};

function ConnectionCard({ row }: { row: ConnectionRow }) {
  return (
    <li className="flex flex-col gap-1.5 bg-card px-4 py-3.5">
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-foreground">{row.label}</span>
        <span
          className={cn(
            "text-[10.5px] font-bold uppercase tracking-[0.1em]",
            STAGE_TONE[row.stage],
          )}
        >
          {STAGE_LABEL[row.stage]}
        </span>
      </span>
      <span className="text-xs leading-snug text-muted-foreground">{row.reason}</span>
      <span className="text-xs leading-snug text-subtle">{row.promise}</span>
    </li>
  );
}

export function ConnectionsPage() {
  const session = useOperatorSession();
  const load = useServerFn(getConnectionFacts);
  const query = useQuery({
    queryKey: ["connection-facts"],
    queryFn: () => load(),
    enabled: session.signedIn,
    retry: false,
    staleTime: 120_000,
  });

  if (query.error) {
    return (
      <EmptyState
        title="Connections could not load"
        description={query.error.message || "The read failed. Try again in a moment."}
      />
    );
  }

  if (query.isPending || !query.data) {
    return (
      <div role="status" aria-busy="true" className="text-sm text-muted-foreground">
        Counting what each connection has stored…
      </div>
    );
  }

  const view = buildConnections(query.data);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-[19px] font-bold text-foreground">
            <Plug className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
            Connections
          </h1>
          <p className="text-[13px] text-muted-foreground">
            The accounts this system reads from, and how far what they collect actually travels.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]",
              view.status.tone === "positive"
                ? "border-primary/40 text-primary"
                : view.status.tone === "danger"
                  ? "border-destructive/40 text-destructive"
                  : "border-warning/40 text-warning",
            )}
          >
            {view.status.text}
          </span>
          {/*
            The capability registry, which lists every credential, module and
            skill. It is the developer-facing inventory; this page is the
            operator-facing question.
          */}
          <Link
            to="/capabilities/registry"
            className="rounded-[10px] border border-input bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:border-border"
          >
            Full registry
          </Link>
        </div>
      </div>

      {view.headline ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-destructive/40 bg-destructive/5 px-4 py-3.5">
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-destructive">
            <TriangleAlert className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
            Collected, and reaching nobody
          </span>
          <p className="text-[13px] leading-snug text-foreground">{view.headline}</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view.tiles.map((tile) => (
          <div
            key={tile.label}
            className="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3.5"
          >
            <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle">
              {tile.label}
            </span>
            {tile.value === null ? (
              <p className="text-[13px] leading-snug text-muted-foreground">{tile.missingReason}</p>
            ) : (
              <>
                <span className="text-[26px] font-bold tabular-nums text-foreground">
                  {tile.value}
                </span>
                <p className="text-xs leading-snug text-muted-foreground">{tile.explanation}</p>
              </>
            )}
          </div>
        ))}
      </div>

      <ul className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-border">
        {view.rows.map((row) => (
          <ConnectionCard key={row.key} row={row} />
        ))}
      </ul>
    </div>
  );
}
