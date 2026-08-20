import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, ListOrdered } from "lucide-react";

import { useYourPages } from "./your-pages-facts";
import { EmptyState } from "./primitives";
import { actionFor } from "@/lib/command-center";
import type { PageRow, StatusTone, TabId, Tile, YourPagesView } from "@/lib/your-pages";
import type { QueueItem, UrgencyTone } from "@/lib/suggestion-queue";
import { cn } from "@/lib/utils";

/**
 * Your pages.
 *
 * The audit reports by check; this page reports by page, because that is the
 * question the operator arrived with. The order is not "worst defect first" but
 * "the page where fixing it changes something", which depends on the constraint
 * that binds, and the page says which order it used and why.
 *
 * Nothing here writes. Every action opens the review screen that already
 * records the decision, and the metered audit stays behind its own button with
 * its cost stated.
 */

const STATUS_TONE: Record<StatusTone, string> = {
  positive: "border-primary/40 text-primary",
  warning: "border-warning/40 text-warning",
  danger: "border-destructive/40 text-destructive",
};

const SEVERITY_TONE: Record<string, string> = {
  critical: "text-destructive",
  warning: "text-warning",
  advice: "text-info",
};

const URGENCY_TONE: Record<UrgencyTone, string> = {
  danger: "text-destructive",
  warning: "text-warning",
  info: "text-info",
};

const LINK =
  "shrink-0 rounded-[10px] border border-input bg-secondary px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-border";

function StatTile({ tile }: { tile: Tile }) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-subtle">
        {tile.label}
      </span>
      {tile.value === null ? (
        <p className="text-[13px] leading-snug text-muted-foreground">{tile.missingReason}</p>
      ) : (
        <>
          <span className="text-[26px] font-bold tabular-nums text-foreground">{tile.value}</span>
          <p className="text-xs leading-snug text-muted-foreground">{tile.explanation}</p>
        </>
      )}
    </div>
  );
}

function PageCard({ row }: { row: PageRow }) {
  return (
    <article className="flex flex-col gap-2 rounded-[10px] border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
          {row.url}
        </span>
        {row.reported ? (
          <span className="shrink-0 text-xs tabular-nums text-subtle">
            {row.impressions.toLocaleString("en-US")} shown · {row.clicks.toLocaleString("en-US")}{" "}
            clicked
          </span>
        ) : (
          // Absent, not zero. Google did not report this page in the window, so
          // there is no count to show and a nought would read as one.
          <span className="shrink-0 text-xs text-subtle">not in Google&rsquo;s report</span>
        )}
      </div>
      {/* Why this page sits here, so the order is never something to just trust. */}
      <p className="text-xs leading-snug text-muted-foreground">{row.reason}</p>
      {row.defects.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {row.defects.map((defect) => (
            <li key={defect.check} className="text-[13px] text-secondary-foreground">
              <span className={cn("font-semibold", SEVERITY_TONE[defect.severity])}>
                {defect.label}
              </span>
              <span className="text-muted-foreground"> — {defect.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {row.changeId ? (
        <div className="flex items-center gap-2">
          {/*
            A fix already exists for this page. It opens on the review screen
            that records the decision, never approving from here.
          */}
          <Link to="/changes/$id" params={{ id: row.changeId }} className={LINK}>
            Review the fix waiting on this page
          </Link>
          <span className="text-xs text-subtle">{row.changeState}</span>
        </div>
      ) : null}
    </article>
  );
}

function SuggestionRow({ item }: { item: QueueItem }) {
  const action = actionFor(item);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-card px-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold text-foreground">{item.title}</span>
        <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-subtle">
          <span className={URGENCY_TONE[item.tone]}>{item.urgencyLabel}</span>
          {item.targetUrl ? ` · ${item.targetUrl}` : null}
        </span>
      </span>
      {action.params ? (
        <Link to={action.to} params={action.params} className={LINK}>
          {action.label}
        </Link>
      ) : (
        <Link to={action.to} className={LINK}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

function QueueList({ items, empty }: { items: readonly QueueItem[]; empty: string }) {
  if (items.length === 0) {
    return <EmptyState title="Nothing here" description={empty} />;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <SuggestionRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function PageList({ view }: { view: YourPagesView }) {
  if (view.rows.length === 0) {
    return (
      <EmptyState
        title="No pages stored yet"
        description="Run the Search Console observation to store the 28 day window this list reads from."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {view.ordering ? (
        <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
          <ListOrdered className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.6} aria-hidden="true" />
          {view.ordering}
        </p>
      ) : null}
      {view.rows.map((row) => (
        <PageCard key={row.url} row={row} />
      ))}
    </div>
  );
}

export function YourPagesPage() {
  const { view, isPending, error } = useYourPages();
  const [tab, setTab] = useState<TabId>("suggestions");

  if (error) {
    return (
      <EmptyState
        title="Your pages could not load"
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
            <FileText className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
            Your pages
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Every page on your site, what is wrong with it, and the fix waiting for you.
          </p>
          {view.property ? (
            // Named, so a read describing a different property than the one the
            // operator has in mind is visible rather than silent.
            <p className="text-xs text-subtle">Showing {view.property}.</p>
          ) : null}
          <p className="text-xs text-subtle">
            {view.asOf === null
              ? "The page audit has not run yet, so nothing below has been read from your pages."
              : `Your pages were last read on ${view.asOf.slice(0, 10)}.`}
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
            The audit reads every page through a metered provider, so it stays a
            deliberate click on the workspace rather than something this page can
            start on its own.
          */}
          <Link to="/pages/tools" className={LINK}>
            Run the audit and preview pages
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {view.tiles.map((tile) => (
          <StatTile key={tile.label} tile={tile} />
        ))}
      </div>

      <div role="tablist" aria-label="Your pages views" className="flex flex-wrap gap-1.5">
        {view.tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`your-pages-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls="your-pages-panel"
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
        id="your-pages-panel"
        role="tabpanel"
        aria-labelledby={`your-pages-tab-${tab}`}
        tabIndex={-1}
      >
        {tab === "suggestions" ? (
          <QueueList
            items={view.suggestions}
            empty="No open suggestion is filed under your pages right now. Some checks cannot run at this site's traffic yet: Getting found on Google lists which."
          />
        ) : null}
        {tab === "pages" ? <PageList view={view} /> : null}
        {tab === "history" ? (
          <QueueList
            items={view.history}
            empty="Suggestions you approve or ignore will be listed here."
          />
        ) : null}
      </div>
    </div>
  );
}
