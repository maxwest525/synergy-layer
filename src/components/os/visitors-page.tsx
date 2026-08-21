import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Minus, Users } from "lucide-react";

import { useOperatorSession } from "@/hooks/use-operator-session";
import { cn } from "@/lib/utils";
import { buildVisitors } from "@/lib/visitors";
import { getVisitorFacts } from "@/lib/visitors.functions";

/**
 * Who visits your site.
 *
 * Reports levels, not changes, because at this property's volume a change on a
 * single page cannot be told from ordinary variation - see the reasoning in
 * `visitors.ts`. What it does report, it reports exactly: how many people came,
 * what they did once they were here, and where they landed.
 *
 * Nothing here writes and nothing calls a provider. Refreshing analytics costs
 * money and lives on the tools page behind its own button.
 */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const id = `visitors-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">
          {title}
        </h2>
        {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function CountRow({ label, count, muted }: { label: string; count: number; muted?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3 bg-card px-4 py-2.5">
      <span
        className={cn(
          "text-[13px]",
          muted ? "text-muted-foreground" : "font-semibold text-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-[13px] font-bold tabular-nums",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {count}
      </span>
    </li>
  );
}

function PageHead({ status }: { status?: ReturnType<typeof buildVisitors>["status"] }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-[19px] font-bold text-foreground">
          <Users className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
          Who visits your site
        </h1>
        <p className="text-[13px] text-muted-foreground">
          How many people came, what they did, and which questions this much traffic can answer.
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        {status ? (
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]",
              status.tone === "positive"
                ? "border-primary/40 text-primary"
                : status.tone === "danger"
                  ? "border-destructive/40 text-destructive"
                  : "border-warning/40 text-warning",
            )}
          >
            {status.text}
          </span>
        ) : null}
        <Link
          to="/ga4/tools"
          className="rounded-[10px] border border-input bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:border-border"
        >
          Analytics tools
        </Link>
      </div>
    </div>
  );
}

export function VisitorsPage() {
  const session = useOperatorSession();
  const load = useServerFn(getVisitorFacts);
  const query = useQuery({
    queryKey: ["visitor-facts"],
    queryFn: () => load(),
    enabled: session.signedIn,
    retry: false,
    staleTime: 120_000,
  });

  if (query.error) {
    return (
      <div className="flex flex-col gap-[18px]">
        <PageHead />
        <div className="rounded-[10px] border border-destructive/40 bg-destructive/5 px-4 py-3.5">
          <p className="text-[13px] font-semibold text-destructive">Analytics could not load</p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {query.error.message || "The read failed. Try again in a moment."}
          </p>
        </div>
      </div>
    );
  }

  if (!session.signedIn) {
    return (
      <div className="flex flex-col gap-[18px]">
        <PageHead />
        <p className="text-sm text-muted-foreground">Sign in to read your stored analytics.</p>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-[18px]">
        <PageHead />
        <div role="status" aria-busy="true" className="text-sm text-muted-foreground">
          Reading your stored analytics…
        </div>
      </div>
    );
  }

  // `data` is legitimately null when nothing has been stored, which is why the
  // pending check above tests `isPending` alone.
  const view = buildVisitors(query.data ?? null);

  return (
    <div className="flex flex-col gap-[22px]">
      <PageHead status={view.status} />

      {view.reading === null ? (
        <div className="rounded-[10px] border border-warning/40 bg-warning/5 px-4 py-3.5">
          <p className="text-[13px] font-semibold text-foreground">
            No analytics reading has been stored yet
          </p>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            Nothing has been read from Google Analytics for this site, so there is nothing here to
            show. This is not a report of zero visitors — it is the absence of a reading.
          </p>
        </div>
      ) : (
        <>
          <Section
            title="Who came"
            hint={`${view.reading.windowLabel}, read ${view.reading.collectedAt.slice(0, 10)}.`}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-4 py-3.5">
                <span className="text-[26px] font-bold tabular-nums text-foreground">
                  {view.reading.sessions}
                </span>
                <p className="text-xs leading-snug text-muted-foreground">
                  visits over {view.reading.windowDays} days — about {view.reading.perDay} a day.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-4 py-3.5">
                <span className="text-[26px] font-bold tabular-nums text-foreground">
                  {view.pages.length + view.pagesBeyondList}
                </span>
                <p className="text-xs leading-snug text-muted-foreground">
                  pages got at least one visit.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-4 py-3.5">
                <span className="text-[26px] font-bold tabular-nums text-foreground">
                  {view.actions.reduce((total, action) => total + action.count, 0)}
                </span>
                <p className="text-xs leading-snug text-muted-foreground">
                  things someone actually did, beyond loading a page.
                </p>
              </div>
            </div>
            {view.reading.partial ? (
              <p className="text-xs leading-snug text-warning">
                Analytics cut this reading short, so these are the rows it returned rather than
                everything that happened.
              </p>
            ) : null}
          </Section>

          <Section
            title="What they did"
            hint="Actions someone took. A count of what happened needs no comparison, so this is the part of the page the traffic volume does not limit."
          >
            {view.actions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nothing beyond page loads was recorded. Either nobody acted, or nothing on the site
                reports actions to Analytics.
              </p>
            ) : (
              <ul
                aria-label="What visitors did"
                className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-border"
              >
                {view.actions.map((action) => (
                  <CountRow key={action.name} label={action.name} count={action.count} />
                ))}
              </ul>
            )}
            {view.automatic.length > 0 ? (
              <details className="rounded-[10px] border border-border bg-card px-4 py-2.5">
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                  {view.automatic.length} events Analytics records by itself
                </summary>
                <ul className="mt-2 flex flex-col gap-px">
                  {view.automatic.map((event) => (
                    <CountRow key={event.name} label={event.name} count={event.count} muted />
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-snug text-subtle">
                  These prove a page loaded, not that anyone did anything.
                </p>
              </details>
            ) : null}
          </Section>

          <Section title="Where they landed" hint="Visits per page, counted once per visit.">
            <ul
              aria-label="Pages by visits"
              className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-border"
            >
              {view.pages.map((page) => (
                <CountRow key={page.page} label={page.page} count={page.sessions} />
              ))}
            </ul>
            {view.pagesBeyondList > 0 ? (
              <p className="text-xs leading-snug text-muted-foreground">
                {view.pagesBeyondList} further pages had at least one visit and are not listed.
              </p>
            ) : null}
          </Section>
        </>
      )}

      {view.silence ? (
        <div className="rounded-[10px] border border-warning/40 bg-warning/5 px-4 py-3.5">
          <p className="text-[13px] leading-snug text-foreground">{view.silence}</p>
        </div>
      ) : null}

      {view.answers.length > 0 ? (
        <Section
          title="What this much traffic can answer"
          hint="Worked out from your actual numbers, not written down — it changes when the traffic does."
        >
          <ul
            aria-label="Questions and whether they can be answered"
            className="flex flex-col gap-px overflow-hidden rounded-[10px] border border-border"
          >
            {view.answers.map((entry) => (
              <li key={entry.question} className="flex gap-3 bg-card px-4 py-3">
                {entry.answerable ? (
                  <Check
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                ) : (
                  <Minus
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                )}
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-foreground">
                    {entry.question}
                    <span className="sr-only">
                      {entry.answerable ? " — can be answered" : " — cannot be answered"}
                    </span>
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {entry.because}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
