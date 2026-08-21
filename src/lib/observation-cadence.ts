/**
 * Read-only observation cadences.
 *
 * A cadence may only be turned on after the source has stored at least one real
 * row. Configured is not connected, so an empty source can never schedule
 * itself. This module holds the pure rules; the server function applies them.
 */

export type CadenceSourceKey = "gsc" | "ga4" | "umami" | "pagespeed";

export type CadenceSource = {
  key: CadenceSourceKey;
  label: string;
  /** Row in `schedules` that drives the daily read. */
  scheduleKey: string;
  /** Default cron used when the cadence row has to be created on first enable. */
  defaultCron: string;
  /** `measurement_runs.provider` value, when the source records runs there. */
  provider: string | null;
  /** Where the first row lives. */
  storeLabel: string;
  /** Route an operator can use to take the first read. */
  proveHref: string;
};

export const OBSERVATION_SOURCES: readonly CadenceSource[] = [
  {
    key: "gsc",
    label: "Search Console",
    scheduleKey: "gsc-daily-observe",
    defaultCron: "0 16 * * *",
    provider: "gsc",
    storeLabel: "Search Console snapshots",
    // The workspace, not the category page: this link is pressed to take a
    // read, and the category page has no button that does that.
    proveHref: "/search/tools",
  },
  {
    key: "ga4",
    label: "GA4",
    scheduleKey: "ga4-daily-observe",
    defaultCron: "30 16 * * *",
    provider: "ga4",
    storeLabel: "GA4 snapshots",
    proveHref: "/ga4/tools",
  },
  {
    key: "umami",
    label: "Umami",
    scheduleKey: "umami-daily-observe",
    defaultCron: "45 16 * * *",
    provider: "umami",
    storeLabel: "Umami snapshots",
    proveHref: "/measurement/tools",
  },
  {
    key: "pagespeed",
    label: "PageSpeed",
    scheduleKey: "pagespeed-daily-observe",
    defaultCron: "15 17 * * *",
    provider: "pagespeed",
    storeLabel: "PageSpeed snapshots",
    proveHref: "/measurement/tools",
  },
] as const;

export function cadenceSource(key: CadenceSourceKey): CadenceSource {
  const source = OBSERVATION_SOURCES.find((entry) => entry.key === key);
  if (!source) throw new Error(`Unknown observation source: ${key}`);
  return source;
}

export type CadenceFacts = {
  /** Rows already stored by this source for the tenant. */
  storedRowCount: number;
  /** When the newest stored row was collected. */
  lastStoredAt: string | null;
  /** Rows returned by the most recent successful read. */
  lastRunRowCount: number | null;
  /** Cadence row state, when the schedule exists. */
  scheduleExists: boolean;
  scheduleEnabled: boolean;
  cron: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastRunStatus: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

export type CadenceStatus = CadenceFacts & {
  key: CadenceSourceKey;
  label: string;
  scheduleKey: string;
  proveHref: string;
  /** A first stored row exists, so the cadence is allowed to run. */
  eligible: boolean;
  /** Eligible and switched on. */
  active: boolean;
  tone: "success" | "warning" | "danger" | "neutral";
  stateLabel: string;
  /** Fact plus imperative, always with one next step. */
  instruction: string;
  actionLabel: string;
  action: "prove" | "enable" | "disable";
};

export function deriveCadenceStatus(source: CadenceSource, facts: CadenceFacts): CadenceStatus {
  const eligible = facts.storedRowCount > 0;
  const active = eligible && facts.scheduleExists && facts.scheduleEnabled;
  const failing = Boolean(facts.lastError);

  let stateLabel: string;
  let tone: CadenceStatus["tone"];
  let instruction: string;
  let actionLabel: string;
  let action: CadenceStatus["action"];

  if (!eligible) {
    stateLabel = "No stored rows";
    tone = "neutral";
    action = "prove";
    actionLabel = `Run the first ${source.label} read`;
    instruction = failing
      ? `${source.label} has stored 0 rows and the last attempt failed. Run the first read now, the cadence stays off until one row lands.`
      : `${source.label} has stored 0 rows. Run the first read now to unlock the daily cadence.`;
  } else if (!active) {
    stateLabel = "Cadence off";
    tone = "warning";
    action = "enable";
    actionLabel = "Turn on the daily cadence";
    instruction = `${source.label} has ${facts.storedRowCount} stored row(s) so the daily read is unlocked. Turn on the cadence now.`;
  } else if (failing) {
    stateLabel = "Cadence failing";
    tone = "danger";
    action = "disable";
    actionLabel = "Turn off the daily cadence";
    instruction = `${source.label} runs daily but the last run reported an error. Read the error below, fix it, or turn the cadence off.`;
  } else {
    stateLabel = "Cadence on";
    tone = "success";
    action = "disable";
    actionLabel = "Turn off the daily cadence";
    instruction = `${source.label} reads once a day on its own. Check the last run below, or turn the cadence off.`;
  }

  return {
    ...facts,
    key: source.key,
    label: source.label,
    scheduleKey: source.scheduleKey,
    proveHref: source.proveHref,
    eligible,
    active,
    tone,
    stateLabel,
    instruction,
    actionLabel,
    action,
  };
}

/** Fail closed: enabling without a stored row is refused, never silently allowed. */
export function assertCadenceMayEnable(source: CadenceSource, storedRowCount: number): void {
  if (storedRowCount > 0) return;
  throw new Error(
    `Refused without changing anything: ${source.label} has stored 0 rows. Take one successful read first, then the daily cadence can be enabled.`,
  );
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "Not recorded";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
