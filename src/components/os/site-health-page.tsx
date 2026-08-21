import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Gauge, Info } from "lucide-react";

import { useSiteHealth } from "./site-health-facts";
import { EmptyState } from "./primitives";
import { SuggestionCard } from "./suggestion-card";
import type { GradedOutcome, StatusTone, TabId, Tile } from "@/lib/site-health";
import type { OutcomeVerdict } from "@/lib/outcome-verdict";
import type { SiteFinding } from "@/lib/site-checks";
import type { QueueItem } from "@/lib/suggestion-queue";
import { cn } from "@/lib/utils";

/**
 * Site health: whether Google can read the site, and whether the fixes worked.
 *
 * The second half is the one that has never existed. Every approved change has
 * been measured against stored windows since the pipeline was written, and
 * nothing has ever read those readings back. An operating system that proposes
 * changes and never grades them is asking to be trusted on faith.
 *
 * Nothing here writes, and a reading taken on a window nothing derives is shown
 * and labelled rather than graded or quietly dropped.
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

/** Plain words, not the stored enum. The operator never sees "too_early". */
const VERDICT_LABEL: Record<OutcomeVerdict, string> = {
  success: "It worked",
  neutral: "No change yet",
  failure: "It did not work",
  not_yet: "Not yet",
  too_early: "Too early to say",
  unmeasurable: "Cannot be measured",
};

const VERDICT_TONE: Record<OutcomeVerdict, string> = {
  success: "text-primary",
  neutral: "text-info",
  failure: "text-destructive",
  not_yet: "text-muted-foreground",
  too_early: "text-muted-foreground",
  unmeasurable: "text-muted-foreground",
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

function OutcomeCard({ outcome }: { outcome: GradedOutcome }) {
  return (
    <article className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">
          {outcome.title}
        </span>
        <span
          className={cn(
            "shrink-0 text-[10.5px] font-bold uppercase tracking-[0.1em]",
            outcome.verdict === null ? "text-subtle" : VERDICT_TONE[outcome.verdict],
          )}
        >
          {outcome.verdict === null ? "Not graded" : VERDICT_LABEL[outcome.verdict]}
        </span>
      </div>
      <p className="text-xs leading-snug text-muted-foreground">{outcome.reason}</p>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-subtle">
        {outcome.windowDays} day reading
        {outcome.targetUrl ? ` · ${outcome.targetUrl}` : null}
      </p>
      <Link
        to="/changes/$id"
        params={{ id: outcome.changeId }}
        className={cn(LINK, "mt-1 self-start")}
      >
        Open the change this measured
      </Link>
    </article>
  );
}

function CrawlCard({ finding }: { finding: SiteFinding }) {
  return (
    <article className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-4 py-3">
      <span className={cn("text-[13px] font-semibold", SEVERITY_TONE[finding.severity])}>
        {finding.label}
      </span>
      <p className="text-[13px] leading-snug text-secondary-foreground">{finding.instruction}</p>
      <p className="text-xs leading-snug text-muted-foreground">{finding.detail}</p>
      {finding.fixableByChangeKind === null ? (
        <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-subtle">
          Fix this yourself
        </p>
      ) : null}
    </article>
  );
}

function QueueList({ items, empty }: { items: readonly QueueItem[]; empty: string }) {
  if (items.length === 0) return <EmptyState title="Nothing here" description={empty} />;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <SuggestionCard key={item.id} item={item} />
      ))}
    </div>
  );
}

export function SiteHealthPage({ initialTab }: { initialTab?: TabId } = {}) {
  const { view, isPending, error } = useSiteHealth();
  // Taken from the route so a link can land on a tab. Without it, "wait for the
  // measurement window, then read the outcome" arrived on Suggestions, which
  // typically says nothing is waiting.
  const [tab, setTab] = useState<TabId>(initialTab ?? "suggestions");

  if (error) {
    return (
      <EmptyState
        title="Site health could not load"
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
            <Gauge className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
            Site health
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Whether your site loads fast, whether Google can read it, and whether the fixes you
            approved actually worked.
          </p>
          <p className="text-xs text-subtle">
            {view.asOf === null
              ? "The site checks have not run yet, so nothing below has been read from your site."
              : `Your site was last checked on ${view.asOf.slice(0, 10)}.`}
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
          <Link to="/measurement/tools" className={LINK}>
            Speed readings and runs
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {view.tiles.map((tile) => (
          <StatTile key={tile.label} tile={tile} />
        ))}
      </div>

      <div role="tablist" aria-label="Site health views" className="flex flex-wrap gap-1.5">
        {view.tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`site-health-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls="site-health-panel"
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
        id="site-health-panel"
        role="tabpanel"
        aria-labelledby={`site-health-tab-${tab}`}
        tabIndex={-1}
      >
        {tab === "suggestions" ? (
          <QueueList
            items={view.suggestions}
            empty="No open suggestion is filed under site health right now."
          />
        ) : null}

        {tab === "outcomes" ? (
          view.outcomes.length === 0 ? (
            <EmptyState
              title="Nothing has been measured yet"
              description="Once you approve a fix and it goes live, its readings are collected and graded here."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {view.truncatedNote ? (
                <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  {view.truncatedNote}
                </p>
              ) : null}
              {view.ungradedNote ? (
                // Named rather than dropped: a window nothing derives is worth
                // seeing, and hiding the reading would hide the problem.
                <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  {view.ungradedNote}
                </p>
              ) : null}
              {view.cohortNote ? (
                <p className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.6} aria-hidden="true" />
                  {view.cohortNote}
                </p>
              ) : null}
              {view.outcomes.map((outcome) => (
                <OutcomeCard key={`${outcome.changeId}:${outcome.windowDays}`} outcome={outcome} />
              ))}
            </div>
          )
        ) : null}

        {tab === "crawl" ? (
          view.crawl.length === 0 ? (
            <EmptyState
              title={view.asOf === null ? "Nothing has been checked" : "No crawl problems"}
              description={
                view.asOf === null
                  ? "Run the audit so robots.txt, your sitemap and every page can be read."
                  : "Google can read robots.txt, your sitemap and every page the audit opened."
              }
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {view.crawl.map((finding) => (
                <CrawlCard key={finding.check} finding={finding} />
              ))}
            </div>
          )
        ) : null}

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
