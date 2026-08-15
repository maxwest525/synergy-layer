export const MEASUREMENT_TIME_ZONE = "America/Los_Angeles";
export const MEASUREMENT_WINDOWS = [0, 7, 14, 28] as const;
export type MeasurementWindowDays = (typeof MEASUREMENT_WINDOWS)[number];

export const SOURCE_ROLES = {
  live_page: "source_of_truth",
  gsc: "source_of_truth",
  ga4: "source_of_truth",
  dataforseo_organic: "enrichment",
  serpapi_transparency: "corroboration",
  serpapi_paid_serp: "corroboration",
  knowledge: "devils_advocate",
} as const;

export type MeasurementProvider = keyof typeof SOURCE_ROLES;
export type SourceRole = (typeof SOURCE_ROLES)[MeasurementProvider];

export type DateWindow = {
  windowDays: MeasurementWindowDays;
  periodStartPt: string;
  periodEndPt: string;
};

const ptFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MEASUREMENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function ptDate(instant: string | Date): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.valueOf())) throw new Error("A valid instant is required.");
  const parts = Object.fromEntries(ptFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}`;
}

export function addCalendarDays(date: string, amount: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error("A YYYY-MM-DD date is required.");
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function approvalBaselineWindow(approvedAt: string): DateWindow {
  const approvedDate = ptDate(approvedAt);
  return {
    windowDays: 0,
    periodStartPt: addCalendarDays(approvedDate, -28),
    periodEndPt: addCalendarDays(approvedDate, -1),
  };
}

export function outcomeWindow(liveAt: string, windowDays: 7 | 14 | 28): DateWindow {
  const firstFullDay = addCalendarDays(ptDate(liveAt), 1);
  return {
    windowDays,
    periodStartPt: firstFullDay,
    periodEndPt: addCalendarDays(firstFullDay, windowDays - 1),
  };
}

export type GscSnapshot = {
  id?: string;
  property: string;
  kind: string;
  period_start_pt: string;
  period_end_pt: string;
  data_state: string;
  possibly_truncated: boolean;
  checksum: string;
  collected_at: string;
  payload: unknown;
};

type GscRow = {
  date: string;
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};
export type GscWindowObservation = {
  status: "complete" | "empty" | "partial";
  rows: GscRow[];
  coverage: {
    expectedDays: number;
    observedDays: number;
    missingDates: string[];
    truncatedDates: string[];
  };
  totals: { clicks: number; impressions: number; averagePosition: number | null };
  sourceRefs: string[];
};

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function datesInWindow(window: DateWindow): string[] {
  const dates: string[] = [];
  for (let date = window.periodStartPt; date <= window.periodEndPt; date = addCalendarDays(date, 1))
    dates.push(date);
  return dates;
}

/** Selects finalized, exact-property daily snapshots and never guesses across a coverage gap. */
export function buildGscWindowObservation(input: {
  snapshots: readonly GscSnapshot[];
  property: string;
  targetUrl: string;
  window: DateWindow;
}): GscWindowObservation {
  const expected = datesInWindow(input.window);
  const latestByDate = new Map<string, GscSnapshot>();
  for (const snapshot of input.snapshots) {
    if (
      snapshot.property !== input.property ||
      snapshot.kind !== "page_query" ||
      snapshot.data_state !== "final"
    )
      continue;
    if (
      snapshot.period_start_pt !== snapshot.period_end_pt ||
      !expected.includes(snapshot.period_start_pt)
    )
      continue;
    const prior = latestByDate.get(snapshot.period_start_pt);
    if (
      !prior ||
      snapshot.collected_at > prior.collected_at ||
      (snapshot.collected_at === prior.collected_at && snapshot.checksum > prior.checksum)
    ) {
      latestByDate.set(snapshot.period_start_pt, snapshot);
    }
  }
  const missingDates = expected.filter((date) => !latestByDate.has(date));
  const truncatedDates = [...latestByDate.values()]
    .filter((s) => s.possibly_truncated)
    .map((s) => s.period_start_pt)
    .sort();
  const rows: GscRow[] = [];
  for (const snapshot of latestByDate.values()) {
    const payload = snapshot.payload as { rows?: unknown } | null;
    if (!Array.isArray(payload?.rows)) continue;
    for (const item of payload.rows) {
      const row = (item ?? {}) as Record<string, unknown>;
      const keys = Array.isArray(row["keys"]) ? row["keys"] : [];
      if (keys[0] !== input.targetUrl) continue;
      rows.push({
        date: snapshot.period_start_pt,
        query: typeof keys[1] === "string" ? keys[1] : "(unknown query)",
        clicks: numberOrZero(row["clicks"]),
        impressions: numberOrZero(row["impressions"]),
        position: numberOrZero(row["position"]),
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.query.localeCompare(b.query));
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const weightedPosition = rows.reduce((sum, row) => sum + row.position * row.impressions, 0);
  const partial = missingDates.length > 0 || truncatedDates.length > 0;
  return {
    status: partial ? "partial" : rows.length === 0 ? "empty" : "complete",
    rows,
    coverage: {
      expectedDays: expected.length,
      observedDays: latestByDate.size,
      missingDates,
      truncatedDates,
    },
    totals: {
      clicks,
      impressions,
      averagePosition: impressions > 0 ? weightedPosition / impressions : null,
    },
    sourceRefs: [...latestByDate.values()].map((s) => s.id ?? s.checksum).sort(),
  };
}

export type Contradiction = { code: string; message: string; providers: MeasurementProvider[] };

/** Flags review questions only. It deliberately cannot return a verdict or success state. */
export function findMeasurementContradictions(input: {
  approvedWordingStillLive?: boolean;
  gscClicksDelta?: number | null;
  ga4SessionsDelta?: number | null;
  gscPartial?: boolean;
  landscapeChanged?: boolean;
  paidPressureChanged?: boolean;
}): Contradiction[] {
  const out: Contradiction[] = [];
  if (input.approvedWordingStillLive === false)
    out.push({
      code: "live_drift",
      message: "The approved wording is no longer live, so attribution needs operator review.",
      providers: ["live_page"],
    });
  if (input.gscPartial)
    out.push({
      code: "partial_organic_data",
      message: "Search Console coverage is partial or truncated; do not infer from the gap.",
      providers: ["gsc"],
    });
  if (
    input.gscClicksDelta != null &&
    input.ga4SessionsDelta != null &&
    Math.sign(input.gscClicksDelta) !== Math.sign(input.ga4SessionsDelta)
  )
    out.push({
      code: "search_behavior_disagree",
      message: "Organic clicks and onsite sessions moved in different directions.",
      providers: ["gsc", "ga4"],
    });
  if (input.landscapeChanged)
    out.push({
      code: "organic_landscape_changed",
      message: "The tracked organic landscape changed during the observation period.",
      providers: ["gsc", "dataforseo_organic"],
    });
  if (input.paidPressureChanged)
    out.push({
      code: "paid_pressure_changed",
      message: "Paid messaging or paid-SERP pressure changed during the observation period.",
      providers: ["serpapi_transparency", "serpapi_paid_serp"],
    });
  return out;
}
