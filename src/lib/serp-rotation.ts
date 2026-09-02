/**
 * Which page Google picked, and whether it kept picking the same one (CODE-97).
 *
 * The detector this replaces asked whether two pages appear on one SERP
 * together. DataForSEO's own published skill argues that is the wrong question,
 * because Google host-crowds to roughly one result per domain: two of your
 * pages will rarely be listed side by side even when they are competing, so
 * co-listing under-reports and its absence proves nothing.
 *
 * The signal it names instead is rotation. Take the page Google chose for a
 * query on each date it was observed. If that choice changes, Google is
 * switching between candidates rather than settling, and the site has given it
 * more than one answer to the same question.
 *
 * Rotation is a fact about the observations, not a threshold: either the
 * chosen page changed across the dates on record or it did not. Nothing here
 * invents a cutoff, and nothing here decides severity. What the finding is
 * worth is a separate judgement, made against impressions that were measured
 * rather than against a band nobody sourced.
 *
 * Run against this tenant's twenty-four dated page-and-query snapshots on
 * 2026-09-02, it found six rotating queries, four of them trading between the
 * home page and the terms of service page on comparison and pricing queries.
 */

/** One dated row as Search Console reports it, page and query together. */
export type DatedPageQueryRow = {
  /** The period end date the row was observed for, ISO yyyy-mm-dd. */
  date: string;
  page: string;
  query: string;
  /** Average position over that period. Lower is better. */
  position: number;
  impressions: number;
  clicks: number;
};

/** The page Google chose for a query on one date. */
export type DatedWinner = {
  date: string;
  page: string;
  position: number;
};

/** One page's share of a rotating query. */
export type RotationContender = {
  page: string;
  /** Dates this page was the chosen one. */
  datesWon: number;
  /** Best position this page reached on any observed date. */
  bestPosition: number;
  impressions: number;
  clicks: number;
};

export type RotatingQuery = {
  query: string;
  /** Every page ever chosen for this query, most dates won first. */
  contenders: RotationContender[];
  /** Dates the query was observed at all. */
  datesObserved: number;
  /** The best position any page reached, across every date. */
  bestPosition: number;
  impressions: number;
  clicks: number;
  /** The chosen page on each date, oldest first, so a finding can show the run. */
  timeline: DatedWinner[];
};

export type RotationReading = {
  /** Queries whose chosen page changed at least once. */
  rotating: RotatingQuery[];
  /**
   * Queries answered by more than one page where the choice never changed.
   * Not rotation, and deliberately reported apart from it: a second page that
   * never wins is a different situation from two pages trading, and calling
   * both cannibalization is what made the old finding useless.
   */
  settled: RotatingQuery[];
  /** Dates present in the input, which bounds every claim above. */
  datesInWindow: number;
};

function bestOf(rows: readonly DatedPageQueryRow[]): number {
  return rows.reduce((best, row) => Math.min(best, row.position), Number.POSITIVE_INFINITY);
}

/**
 * The page Google chose on each date: the lowest position observed.
 *
 * Ties are broken by page URL rather than left to input order, so the same
 * observations always read the same way. A tie is itself unusual and the
 * timeline shows it, because both dates appear with the same position.
 */
export function winnersByDate(rows: readonly DatedPageQueryRow[]): DatedWinner[] {
  const byDate = new Map<string, DatedPageQueryRow>();
  for (const row of rows) {
    const held = byDate.get(row.date);
    if (
      !held ||
      row.position < held.position ||
      (row.position === held.position && row.page < held.page)
    ) {
      byDate.set(row.date, row);
    }
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ date: row.date, page: row.page, position: row.position }));
}

export function readRotation(rows: readonly DatedPageQueryRow[]): RotationReading {
  const byQuery = new Map<string, DatedPageQueryRow[]>();
  for (const row of rows) {
    const held = byQuery.get(row.query);
    if (held) held.push(row);
    else byQuery.set(row.query, [row]);
  }

  const rotating: RotatingQuery[] = [];
  const settled: RotatingQuery[] = [];

  for (const [query, queryRows] of byQuery) {
    const pages = new Set(queryRows.map((row) => row.page));
    if (pages.size < 2) continue;

    const timeline = winnersByDate(queryRows);
    const winners = new Set(timeline.map((entry) => entry.page));

    const contenders: RotationContender[] = [...pages]
      .map((page) => {
        const pageRows = queryRows.filter((row) => row.page === page);
        return {
          page,
          datesWon: timeline.filter((entry) => entry.page === page).length,
          bestPosition: bestOf(pageRows),
          impressions: pageRows.reduce((sum, row) => sum + row.impressions, 0),
          clicks: pageRows.reduce((sum, row) => sum + row.clicks, 0),
        };
      })
      .sort((a, b) => b.datesWon - a.datesWon || a.bestPosition - b.bestPosition);

    const reading: RotatingQuery = {
      query,
      contenders,
      datesObserved: timeline.length,
      bestPosition: bestOf(queryRows),
      impressions: queryRows.reduce((sum, row) => sum + row.impressions, 0),
      clicks: queryRows.reduce((sum, row) => sum + row.clicks, 0),
      timeline,
    };

    if (winners.size > 1) rotating.push(reading);
    else settled.push(reading);
  }

  const order = (a: RotatingQuery, b: RotatingQuery) =>
    b.impressions - a.impressions ||
    a.bestPosition - b.bestPosition ||
    a.query.localeCompare(b.query);

  return {
    rotating: rotating.sort(order),
    settled: settled.sort(order),
    datesInWindow: new Set(rows.map((row) => row.date)).size,
  };
}

/**
 * The finding's own sentence, built from what was observed.
 *
 * Every number in it came from a row. There is no verdict word, no severity and
 * no recommendation: which page should answer the query is a decision about the
 * site's purpose, and the vendor's own guidance is that the usual reflex is
 * wrong ("don't default to merge and 301"), so this states the fact and leaves
 * the choice where it belongs.
 */
export function describeRotation(reading: RotatingQuery): string {
  const [first, second] = reading.contenders;
  if (!first || !second) return "";
  const others = reading.contenders.length - 2;
  const alsoRan = others > 0 ? `, and ${others} other page${others === 1 ? "" : "s"}` : "";
  return (
    `Google changed which page it showed for "${reading.query}" across ${reading.datesObserved} observed ` +
    `date${reading.datesObserved === 1 ? "" : "s"}. ${first.page} was chosen on ${first.datesWon} of them and ` +
    `${second.page} on ${second.datesWon}${alsoRan}. Best position reached was ${reading.bestPosition}, ` +
    `over ${reading.impressions} impression${reading.impressions === 1 ? "" : "s"}.`
  );
}
