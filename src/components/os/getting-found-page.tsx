import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, TriangleAlert } from "lucide-react";

import { useGettingFound } from "./getting-found-facts";
import { EmptyState } from "./primitives";
import { SuggestionCard } from "./suggestion-card";
import type {
  Answerability,
  GettingFoundTile,
  GettingFoundView,
  SearchListRow,
  StatusTone,
  TabId,
  TileDelta,
} from "@/lib/getting-found";
import { cn } from "@/lib/utils";

/**
 * Getting found on Google.
 *
 * Every number here is a stored row. A tile with nothing behind it renders the
 * reason it is missing, never a zero, so an unmeasured workspace reads as
 * unmeasured.
 *
 * The page leads with the diagnosis rather than the ranking: what is actually
 * holding the site back, then the suggestions that address it, then the ones
 * that are real but are not today's problem. Nothing is hidden by that
 * ordering, and nothing on this page writes. Every action opens the review
 * screen that already records the decision.
 */

const STATUS_TONE: Record<StatusTone, string> = {
  positive: "border-primary/40 text-primary",
  warning: "border-warning/40 text-warning",
  danger: "border-destructive/40 text-destructive",
};

function DeltaLabel({ delta }: { delta: TileDelta }) {
  const arrow = delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "■";
  const tone =
    delta.tone === "positive"
      ? "text-primary"
      : delta.tone === "danger"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={cn("text-xs font-semibold", tone)}>
      {arrow} {delta.label}
    </span>
  );
}

function StatTile({ tile }: { tile: GettingFoundTile }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle">
        {tile.label}
      </span>
      {tile.value === null ? (
        <p className="text-[13px] leading-snug text-muted-foreground">{tile.missingReason}</p>
      ) : (
        <>
          <span className="flex items-baseline gap-2 text-[26px] font-bold tabular-nums text-foreground">
            {tile.value}
            {tile.delta ? <DeltaLabel delta={tile.delta} /> : null}
          </span>
          <p className="text-xs leading-snug text-muted-foreground">{tile.explanation}</p>
        </>
      )}
    </div>
  );
}

/** The diagnosis, stated before anything is ranked beneath it. */
function ConstraintBanner({ constraint }: { constraint: GettingFoundView["constraint"] }) {
  if (!constraint) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-warning/40 bg-warning/5 px-4 py-3.5">
      <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-warning">
        <TriangleAlert className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
        What is actually holding you back
      </span>
      <p className="text-[13px] leading-snug text-foreground">{constraint.reason}</p>
      <p className="text-xs tabular-nums text-subtle">
        {constraint.addressing} of the suggestions below address this.{" "}
        {constraint.parked > 0
          ? `${constraint.parked} more are real, but they are not today's problem.`
          : null}
      </p>
    </div>
  );
}

/**
 * What this volume can and cannot answer, collapsed by default so it does
 * not compete with the diagnosis above it. Renders a degraded form naming
 * what is missing when only the comparison is absent; renders nothing only
 * when the page count is unknown — the tiles already carry that reason, and
 * this is never a second "not measurable" message.
 */
function AnswerabilityPanel({ answerability }: { answerability: Answerability | null }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!answerability) return null;
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3.5">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex items-center gap-2 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle"
      >
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
        What your traffic can answer
      </button>
      {isOpen ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] leading-snug text-foreground">{answerability.line}</p>
          {answerability.beyond.length > 0 ? (
            <ul className="flex flex-col gap-1 text-xs leading-snug text-muted-foreground">
              {answerability.beyond.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
          {answerability.waitingOn.length > 0 ? (
            // What is blocking an answer besides volume. Kept beside the volume
            // line rather than folded into it: "not enough traffic" and "no
            // second window yet" are different answers.
            <ul className="flex flex-col gap-1 text-xs leading-snug text-muted-foreground">
              {answerability.waitingOn.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SuggestionList({ view }: { view: GettingFoundView }) {
  if (view.suggestions.length === 0) {
    return (
      <EmptyState
        title="Nothing is waiting here"
        description="No open suggestion is filed under getting found on Google right now."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {view.suggestions.map((item, index) => (
        <div key={item.id} className="flex flex-col gap-2.5">
          {index === view.parkedFrom ? (
            <p className="pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle">
              Real, but not today&rsquo;s problem
            </p>
          ) : null}
          <SuggestionCard item={item} />
        </div>
      ))}
    </div>
  );
}

function SearchList({
  rows,
  unit,
  heading,
  emptyReason,
}: {
  rows: readonly SearchListRow[];
  unit: string;
  heading: string;
  emptyReason: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={`No ${unit} stored yet`} description={emptyReason} />;
  }
  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-border">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-4 bg-card px-4 py-2.5"
        >
          <span className="min-w-0 truncate text-[13px] text-foreground">{row.label}</span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-muted-foreground">
            {row.clicks.toLocaleString("en-US")}
          </span>
        </div>
      ))}
    </div>
  );
}

function HistoryList({ view }: { view: GettingFoundView }) {
  if (view.history.length === 0) {
    return (
      <EmptyState
        title="Nothing decided yet"
        description="Suggestions you approve or ignore will be listed here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {view.history.map((item) => (
        <SuggestionCard key={item.id} item={item} />
      ))}
    </div>
  );
}

const NOT_COLLECTED =
  "Run the Search Console observation to store the 28 day window this list reads from.";

export function GettingFoundPage() {
  const { view, isPending, error } = useGettingFound();
  const [tab, setTab] = useState<TabId>("suggestions");

  if (error) {
    return (
      <EmptyState
        title="Getting found on Google could not load"
        description={error.message || "The read failed. Try again in a moment."}
      />
    );
  }

  if (isPending || !view) {
    return (
      <div role="status" aria-busy="true" className="text-sm text-muted-foreground">
        Reading your stored numbers…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-[19px] font-bold text-foreground">
            <Search className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
            Getting found on Google
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Whether people can find you in search, and what to fix so more of them do.
          </p>
          {/*
            A stored window shown without its date is shown as current. When a
            collection run has not completed, this says so rather than leaving
            the numbers undated.
          */}
          <p className="text-xs text-subtle">
            {view.asOf === null
              ? "No complete window is stored yet, so the lists below are empty."
              : `Search numbers cover the 28 days ending ${view.asOf}.`}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]",
              STATUS_TONE[view.status.tone],
            )}
          >
            {view.status.text}
          </span>
          {/*
            The evidence workspace, where the observation is run and a property
            is connected. It is a tool, not the front door, so it sits behind
            this page rather than in the nav.
          */}
          <Link
            to="/search/tools"
            className="rounded-[10px] border border-input bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:border-border"
          >
            Evidence and tools
          </Link>
        </div>
      </div>

      <ConstraintBanner constraint={view.constraint} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {view.tiles.map((tile) => (
          <StatTile key={tile.label} tile={tile} />
        ))}
      </div>

      <AnswerabilityPanel answerability={view.answerability} />

      <div role="tablist" aria-label="Getting found views" className="flex flex-wrap gap-1.5">
        {view.tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`getting-found-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls="getting-found-panel"
            onClick={() => setTab(entry.id)}
            className={cn(
              "rounded-[10px] border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              tab === entry.id
                ? "border-border bg-secondary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
            {entry.count === null ? null : (
              <span className="ml-1.5 tabular-nums text-subtle">{entry.count}</span>
            )}
          </button>
        ))}
      </div>

      <div
        id="getting-found-panel"
        role="tabpanel"
        aria-labelledby={`getting-found-tab-${tab}`}
        tabIndex={-1}
      >
        {tab === "suggestions" ? <SuggestionList view={view} /> : null}
        {tab === "queries" ? (
          <SearchList
            rows={view.queries}
            unit="searches"
            heading="What people searched for"
            emptyReason={NOT_COLLECTED}
          />
        ) : null}
        {tab === "pages" ? (
          <SearchList
            rows={view.pages}
            unit="pages"
            heading="Your page"
            emptyReason={NOT_COLLECTED}
          />
        ) : null}
        {tab === "history" ? <HistoryList view={view} /> : null}
      </div>
    </div>
  );
}
