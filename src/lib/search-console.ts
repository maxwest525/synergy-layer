export type DailyMetric = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
};

export type NormalizedInspection = {
  verdict: string;
  coverageState: string | null;
  robotsTxtState: string | null;
  indexingState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  crawledAs: string | null;
  sitemaps: string[];
  referringUrls: string[];
  inspectionResultLink: string | null;
  mobileUsabilityVerdict: string | null;
  richResultsVerdict: string | null;
};

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Normalize one URL and prove that the selected Search Console property covers
 * it. Domain properties include subdomains; URL-prefix properties do not.
 */
export function normalizeOwnedUrl(property: string, candidate: string): string {
  let url: URL;
  try {
    url = new URL(candidate.trim());
  } catch {
    throw new Error("Enter a valid absolute page or sitemap URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Enter a valid HTTP or HTTPS URL without embedded credentials.");
  }

  let covered = false;
  if (property.toLowerCase().startsWith("sc-domain:")) {
    const domain = property.slice("sc-domain:".length).trim().toLowerCase().replace(/^\.+/, "");
    const host = url.hostname.toLowerCase();
    covered = domain !== "" && (host === domain || host.endsWith(`.${domain}`));
  } else {
    try {
      const prefix = new URL(property);
      covered = url.origin === prefix.origin && url.pathname.startsWith(prefix.pathname);
    } catch {
      covered = false;
    }
  }

  if (!covered) {
    throw new Error("That URL is not covered by the selected Search Console property.");
  }
  url.hash = "";
  return url.toString();
}

/** Keep the provider's inspection facts without turning them into a score. */
export function normalizeInspection(payload: unknown): NormalizedInspection {
  const inspection = object(object(payload)["inspectionResult"]);
  const index = object(inspection["indexStatusResult"]);
  const mobile = object(inspection["mobileUsabilityResult"]);
  const rich = object(inspection["richResultsResult"]);
  return {
    verdict: text(index["verdict"]) ?? "UNKNOWN",
    coverageState: text(index["coverageState"]),
    robotsTxtState: text(index["robotsTxtState"]),
    indexingState: text(index["indexingState"]),
    pageFetchState: text(index["pageFetchState"]),
    lastCrawlTime: text(index["lastCrawlTime"]),
    googleCanonical: text(index["googleCanonical"]),
    userCanonical: text(index["userCanonical"]),
    crawledAs: text(index["crawledAs"]),
    sitemaps: textList(index["sitemap"]),
    referringUrls: textList(index["referringUrls"]),
    inspectionResultLink: text(inspection["inspectionResultLink"]),
    mobileUsabilityVerdict: text(mobile["verdict"]),
    richResultsVerdict: text(rich["verdict"]),
  };
}

function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid calendar date: ${isoDate}`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type DateQueryRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

/**
 * Search Analytics omits dates with no data. Materialize those dates as
 * zero-volume days so a comparison always represents equal calendar windows.
 */
export function materializeDailyTotals(
  rows: readonly DateQueryRow[],
  startDate: string,
  endDate: string,
): DailyMetric[] {
  const byDate = new Map(rows.map((row) => [row.keys?.[0], row]));
  const result: DailyMetric[] = [];
  for (let date = startDate, guard = 0; date <= endDate; date = shiftIsoDate(date, 1), guard += 1) {
    if (guard > 366) throw new Error("Search Console comparison range is unexpectedly large.");
    const row = byDate.get(date);
    const clicks = row?.clicks ?? 0;
    const impressions = row?.impressions ?? 0;
    result.push({
      date,
      clicks,
      impressions,
      ctr: impressions > 0 ? (row?.ctr ?? clicks / impressions) : null,
      position: impressions > 0 ? (row?.position ?? null) : null,
    });
  }
  return result;
}

type PeriodTotals = {
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
};

export type PeriodComparison =
  | {
      status: "insufficient";
      availableDays: number;
      requiredDays: number;
      latestDate: string | null;
    }
  | {
      status: "ready";
      windowDays: number;
      previous: PeriodTotals;
      current: PeriodTotals;
      change: {
        clicksPercent: number | null;
        impressionsPercent: number | null;
        ctrPoints: number | null;
        position: number | null;
      };
    };

function summarizePeriod(rows: readonly DailyMetric[]): PeriodTotals {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const positioned = rows.filter((row) => row.position !== null && row.impressions > 0);
  const positionImpressions = positioned.reduce((sum, row) => sum + row.impressions, 0);
  return {
    startDate: rows[0]!.date,
    endDate: rows.at(-1)!.date,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position:
      positionImpressions > 0
        ? positioned.reduce((sum, row) => sum + row.position! * row.impressions, 0) /
          positionImpressions
        : null,
  };
}

function percentChange(current: number, previous: number): number | null {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

/** Compare the latest complete 28 calendar days with the preceding 28. */
export function buildPeriodComparison(
  rows: readonly (DailyMetric & { collectedAt?: string })[],
  windowDays = 28,
): PeriodComparison {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const latestDate = [...byDate.keys()].sort().at(-1) ?? null;
  const requiredDays = windowDays * 2;
  if (!latestDate) {
    return { status: "insufficient", availableDays: 0, requiredDays, latestDate: null };
  }

  const dates = Array.from({ length: requiredDays }, (_, index) =>
    shiftIsoDate(latestDate, index - requiredDays + 1),
  );
  const complete = dates.flatMap((date) => {
    const row = byDate.get(date);
    return row ? [row] : [];
  });
  if (complete.length !== requiredDays) {
    return {
      status: "insufficient",
      availableDays: complete.length,
      requiredDays,
      latestDate,
    };
  }

  const previous = summarizePeriod(complete.slice(0, windowDays));
  const current = summarizePeriod(complete.slice(windowDays));
  return {
    status: "ready",
    windowDays,
    previous,
    current,
    change: {
      clicksPercent: percentChange(current.clicks, previous.clicks),
      impressionsPercent: percentChange(current.impressions, previous.impressions),
      ctrPoints:
        current.ctr === null || previous.ctr === null ? null : (current.ctr - previous.ctr) * 100,
      position:
        current.position === null || previous.position === null
          ? null
          : current.position - previous.position,
    },
  };
}
