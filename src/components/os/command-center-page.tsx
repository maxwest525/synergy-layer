import { Link } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";

import { tileIcon } from "./category-icons";
import { useCommandCenter } from "./command-center-facts";
import { EmptyState } from "./primitives";
import type { Delta, SuggestedNextRow, Tile, TopCard, TopCardAction } from "@/lib/command-center";
import type { UrgencyTone } from "@/lib/suggestion-queue";
import { cn } from "@/lib/utils";

/**
 * The Command center: what needs you first, and the fastest way to clear it.
 *
 * Every number on this page is a stored row. A tile with no evidence behind it
 * renders its reason instead of a value, so an empty workspace reads as "this
 * has not been measured yet" and never as a zero that looks like a measurement.
 */

const TONE_TEXT: Record<UrgencyTone, string> = {
  danger: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

const TONE_DOT: Record<UrgencyTone, string> = {
  danger: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
};

function DeltaLabel({ delta }: { delta: Delta }) {
  const arrow = delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "■";
  const tone =
    delta.tone === "positive"
      ? "text-primary"
      : delta.tone === "danger"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <span className={cn("text-xs font-semibold", tone)}>
      {arrow} {Math.abs(Math.round(delta.percent))}%
    </span>
  );
}

function StatTile({ tile }: { tile: Tile }) {
  const Icon = tileIcon(tile.icon);
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3.5">
      <span className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle">
        <Icon className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
        {tile.label}
      </span>
      {tile.value === null ? (
        // No stored evidence. Say what is missing instead of showing a number.
        <p className="text-[13px] leading-snug text-muted-foreground">{tile.missingReason}</p>
      ) : (
        <>
          <span className="text-[26px] font-bold tabular-nums text-foreground">
            {tile.value.toLocaleString("en-US")}{" "}
            {tile.delta ? <DeltaLabel delta={tile.delta} /> : null}
          </span>
          <p className="text-xs leading-snug text-muted-foreground">{tile.explanation}</p>
        </>
      )}
    </div>
  );
}

/**
 * A link to a card's destination.
 *
 * `params` is passed only when the destination takes one; under
 * `exactOptionalPropertyTypes` an explicitly-undefined `params` is a type error
 * rather than an omission, so the two cases are separate elements.
 */
function ActionLink({
  action,
  className,
  ariaLabel,
  children,
}: {
  action: TopCardAction;
  className: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  if (action.params) {
    return (
      <Link to={action.to} params={action.params} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }
  return (
    <Link to={action.to} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}

function SuggestionCard({ card }: { card: TopCard }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-card p-4">
      <h3 className="text-sm font-bold text-foreground">{card.title}</h3>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-foreground">
        {card.kindLabel} · <span className={TONE_TEXT[card.tone]}>{card.urgencyLabel}</span>
      </p>
      {card.evidence ? (
        <p className="truncate text-[13px] text-secondary-foreground">{card.evidence}</p>
      ) : null}
      <p className="text-xs text-subtle">In {card.category.title}</p>
      <div className="mt-1 flex items-center gap-2">
        <ActionLink
          action={card.action}
          className="flex flex-1 items-center justify-center rounded-[10px] border border-input bg-secondary px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-border"
        >
          {card.action.label}
        </ActionLink>
        {card.canIgnore ? (
          /*
            Ignore is a governed decision, so it happens on the review screen
            that already records it, never as a silent write from a home-page
            button. The card is a front door, not a bypass.
          */
          <ActionLink
            action={card.action}
            ariaLabel={`Open ${card.title} to ignore it`}
            className="flex items-center gap-1.5 rounded-[10px] border border-input bg-secondary px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Ignore
          </ActionLink>
        ) : null}
      </div>
    </article>
  );
}

function SuggestedRow({ row }: { row: SuggestedNextRow }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-card px-4 py-3">
      <span className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
        <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", TONE_DOT[row.tone])} />
        {row.title}
      </span>
      <Link
        to={row.to}
        className="shrink-0 rounded-[10px] border border-input bg-secondary px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-border"
      >
        {row.actionLabel}
      </Link>
    </div>
  );
}

export function CommandCenterPage() {
  const { view, isPending, error } = useCommandCenter();

  if (error) {
    return (
      <EmptyState
        title="The Command center could not load"
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
      <div className="flex flex-col gap-1">
        <h1 className="text-[19px] font-bold text-foreground">Command center</h1>
        <p className="text-[13px] text-muted-foreground">
          What needs you first, and the fastest way to clear it.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
          <Sparkles className="h-3 w-3" strokeWidth={1.6} aria-hidden="true" />
          Marky assist · biggest win first
        </span>
        {view.assistLine.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 text-[13px] font-semibold text-foreground">
            {view.assistLine.map((phrase) => (
              <span key={phrase}>{phrase}</span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] font-semibold text-foreground">{view.emptyHeadline}</p>
        )}
      </div>

      {view.topCards.length > 0 ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {view.topCards.map((card) => (
              <SuggestionCard key={card.id} card={card} />
            ))}
          </div>
          <p className="text-xs tabular-nums text-subtle">
            Showing {view.topCards.length} of {view.totalWaiting} waiting across all categories
          </p>
        </>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {view.tiles.map((tile) => (
          <StatTile key={tile.label} tile={tile} />
        ))}
      </div>

      {view.suggestedNext.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
            Suggested next · Nothing changes without your approval
          </span>
          {view.suggestedNext.map((row) => (
            <SuggestedRow key={row.id} row={row} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
