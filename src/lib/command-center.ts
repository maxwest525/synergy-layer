/**
 * The Command center's view model.
 *
 * Everything the home page renders is derived here from stored facts, so the
 * page component stays a renderer and every honesty rule is under test.
 *
 * The rule this module exists to enforce: a tile shows a number only when a
 * real row backs it. When no row does, the tile carries `value: null` and a
 * `missingReason` naming what is missing and what would fix it. There is no
 * fallback, no placeholder, and no derived "score". A stored zero is a zero; an
 * absent read is an absence, and the two never render alike.
 */

import { CATEGORIES, type Category, type CategoryIcon, type CategoryId } from "./categories";
import type { PeriodComparison } from "./search-console";
import {
  buildQueue,
  compareQueueItems,
  navToneForUrgency,
  toneForUrgency,
  type NavTone,
  type Queue,
  type QueueItem,
  type QueueSource,
  type UrgencyTone,
} from "./suggestion-queue";

const DAY_MS = 86_400_000;
const TOP_CARDS = 3;
/**
 * What the audit actually does, on the button.
 *
 * The audit renders on the self-hosted Crawl4AI box when it is configured, so
 * this is not worded as a per-call vendor charge. That was written here long
 * before it was true: the comment claimed it while `page-audit.server.ts` sent
 * every page to the metered Firecrawl API, and the claim is why nobody checked.
 * If the self-hosted crawler is unconfigured or fails, the audit still falls
 * back to Firecrawl and that page is billed -- the stored observation records
 * which renderer actually read it, so the answer is in the data rather than in
 * this comment.
 *
 * It stays behind an explicit click regardless: reading a hundred pages is a
 * real action against the operator's own site and their own server, and it
 * should never happen because someone opened a page.
 */
const PAGE_AUDIT_COST = "reads up to 100 pages";

export type Ga4Window = {
  readonly startDate: string;
  readonly endDate: string;
  readonly sessions: number;
};

export type CommandCenterFacts = {
  readonly now: string;
  /** The connected Search Console property, or null when none is selected. */
  readonly property: string | null;
  /** Null when no property is selected, so there is nothing to compare. */
  readonly search: PeriodComparison | null;
  readonly ga4: {
    /** The stored, plain-sentence connection state from `describeGa4Connection`. */
    readonly connectionStatement: string;
    readonly windowDays: number;
    readonly snapshots: readonly Ga4Window[];
  };
  readonly changes: {
    /** Change requests proven live on the rendered page. */
    readonly fixesLive: number;
    /** Distinct pages whose fix reached `verified`. */
    readonly pagesImproved: number;
  };
  readonly audit: {
    readonly hasRun: boolean;
    readonly pagesNeedingFixes: number;
  };
  /**
   * What the top bar's status is allowed to claim: connections whose last
   * verification failed, and measurement providers whose most recent run
   * failed.
   *
   * Both describe the state right now. A provider that failed for a week and
   * then succeeded is not failing, so counting historical failures would keep
   * the bar lit long after the cause was fixed.
   */
  readonly health: {
    readonly brokenConnections: number;
    readonly failingProviders: number;
    /** Connection rows that have ever been probed. Zero means nothing has checked the plumbing. */
    readonly connectionsChecked: number;
  };
  readonly queueSources: readonly QueueSource[];
};

export type TileIcon = "search" | "line-chart" | "check" | "bar-chart" | "file-text";

export type Delta = {
  readonly direction: "up" | "down" | "flat";
  readonly percent: number;
  /** Green when the movement is good for the operator, red when it is not. */
  readonly tone: "positive" | "danger" | "neutral";
};

export type Tile = {
  readonly label: string;
  readonly icon: TileIcon;
  readonly value: number | null;
  readonly delta: Delta | null;
  /** Plain words, with the technical term quoted where one exists. */
  readonly explanation: string;
  /** Null exactly when `value` is a real stored number. */
  readonly missingReason: string | null;
};

/**
 * Where a card's primary button goes.
 *
 * `params` is present only for the two detail routes that take one, and is
 * omitted rather than set to undefined, so the router's own param typing keeps
 * checking these links.
 */
export type TopCardAction = {
  readonly label: string;
  readonly to: string;
  readonly params?: { readonly id: string };
};

export type TopCard = {
  readonly id: string;
  readonly category: Category;
  /** The spec puts an icon on every card title; this is its name. */
  readonly icon: CategoryIcon;
  readonly title: string;
  readonly kindLabel: string;
  readonly urgencyLabel: string;
  readonly tone: UrgencyTone;
  readonly evidence: string | null;
  readonly action: TopCardAction;
  readonly canIgnore: boolean;
};

export type CategoryRow = {
  readonly category: Category;
  readonly waiting: number;
  /**
   * The nav badge's colour: green, yellow or red, never the card's blue. Null
   * when nothing is waiting, so a quiet category shows no badge at all.
   */
  readonly tone: NavTone | null;
};

export type SuggestedNextRow = {
  readonly id: string;
  readonly title: string;
  /** The board dots these rows green, yellow or red, like the nav badges. */
  readonly tone: NavTone;
  readonly actionLabel: string;
  readonly to: string;
  /**
   * True when acting costs money at a provider. A metered row always carries its
   * cost in `actionLabel` and only ever runs from this explicit click.
   */
  readonly metered: boolean;
};

export type CommandCenterView = {
  /** The connected property, for the breadcrumb. Null when none is selected. */
  readonly property: string | null;
  readonly tiles: readonly Tile[];
  readonly categories: readonly CategoryRow[];
  /**
   * What most needs you, one phrase per waiting category. Each carries the
   * category's own route: this used to render as plain text with nothing to
   * click, which was the most prominent instruction on the page and the one
   * an operator could least act on.
   */
  readonly assistLine: readonly { readonly phrase: string; readonly to: string }[];
  readonly topCards: readonly TopCard[];
  readonly totalWaiting: number;
  readonly suggestedNext: readonly SuggestedNextRow[];
  /** The top bar's right-hand status. */
  readonly statusLine: StatusLine;
  /** Shown instead of the assist line when the whole queue is clear. */
  readonly emptyHeadline: string | null;
};

function deltaFrom(percent: number | null, goodWhen: "up" | "down"): Delta | null {
  if (percent === null) return null;
  const direction = percent > 0 ? "up" : percent < 0 ? "down" : "flat";
  if (direction === "flat") return { direction, percent, tone: "neutral" };
  return { direction, percent, tone: direction === goodWhen ? "positive" : "danger" };
}

function googleClicksTile(facts: CommandCenterFacts): Tile {
  const base = {
    label: "Google clicks · 28d",
    icon: "search",
    explanation:
      'How many people clicked through to your site from Google. Google calls this "clicks".',
  } as const;

  if (facts.search === null) {
    return {
      ...base,
      value: null,
      delta: null,
      missingReason:
        "No Search Console property is selected, so there is nothing to read clicks from.",
    };
  }

  if (facts.search.status === "insufficient") {
    return {
      ...base,
      value: null,
      delta: null,
      missingReason: `Only ${facts.search.availableDays} of ${facts.search.requiredDays} required calendar days are stored, so no 28 day total is shown yet.`,
    };
  }

  return {
    ...base,
    value: facts.search.current.clicks,
    delta: deltaFrom(facts.search.change.clicksPercent, "up"),
    missingReason: null,
  };
}

export type Ga4Comparison = {
  readonly current: Ga4Window | null;
  readonly prior: Ga4Window | null;
  /** Why no prior window was used, when one was wanted. */
  readonly reason: string | null;
};

function dayBefore(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10);
}

/**
 * Picks the latest stored window and, only if one exists, the window that ends
 * the day before it starts.
 *
 * GA4 snapshots roll daily, so two consecutive snapshots overlap by 27 days.
 * Diffing those would manufacture a period change out of a one day shift, which
 * is exactly the kind of invented number this redesign forbids.
 */
export function selectGa4Comparison(
  snapshots: readonly Ga4Window[],
  windowDays: number,
): Ga4Comparison {
  if (snapshots.length === 0) return { current: null, prior: null, reason: null };

  const current = [...snapshots].sort((a, b) => b.endDate.localeCompare(a.endDate))[0]!;
  const wantedPriorEnd = dayBefore(current.startDate);
  const prior = snapshots.find((snapshot) => snapshot.endDate === wantedPriorEnd) ?? null;

  if (prior === null) {
    return {
      current,
      prior: null,
      reason: `Only one ${windowDays} day window is stored, so there is no prior period to compare it with.`,
    };
  }
  return { current, prior, reason: null };
}

function visitsTile(facts: CommandCenterFacts): Tile {
  const base = {
    label: "Visits · 28d",
    icon: "line-chart",
    explanation:
      'How many visits your site had, however people arrived. Analytics calls these "sessions".',
  } as const;

  const comparison = selectGa4Comparison(facts.ga4.snapshots, facts.ga4.windowDays);

  if (comparison.current === null) {
    return {
      ...base,
      value: null,
      delta: null,
      missingReason: facts.ga4.connectionStatement,
    };
  }

  if (comparison.prior === null) {
    return { ...base, value: comparison.current.sessions, delta: null, missingReason: null };
  }

  const previous = comparison.prior.sessions;
  const percent =
    previous === 0 ? null : ((comparison.current.sessions - previous) / previous) * 100;

  return {
    ...base,
    value: comparison.current.sessions,
    delta: deltaFrom(percent, "up"),
    missingReason: null,
  };
}

function fixesLiveTile(facts: CommandCenterFacts): Tile {
  return {
    label: "Fixes live",
    icon: "check",
    value: facts.changes.fixesLive,
    delta: null,
    explanation: "Changes you approved that are now proven live on the real page.",
    missingReason: null,
  };
}

function pagesImprovedTile(facts: CommandCenterFacts): Tile {
  return {
    label: "Pages improved",
    icon: "bar-chart",
    value: facts.changes.pagesImproved,
    delta: null,
    explanation: "Pages where a fix went live and the result was checked afterwards and verified.",
    missingReason: null,
  };
}

function pagesNeedingFixesTile(facts: CommandCenterFacts): Tile {
  const base = {
    label: "Pages needing fixes",
    icon: "file-text",
    explanation: "Pages where a check found something worth fixing.",
  } as const;

  if (!facts.audit.hasRun) {
    return {
      ...base,
      value: null,
      delta: null,
      missingReason:
        "The page audit has never run, so every page check is blind until it runs once.",
    };
  }
  return { ...base, value: facts.audit.pagesNeedingFixes, delta: null, missingReason: null };
}

const KIND_LABEL: Record<QueueItem["kind"], string> = {
  change: "Page fix",
  recommendation: "Suggestion",
  audit: "Page check",
};

/**
 * Where a queue item opens.
 *
 * Exported so the category pages route to the same screen the Command center
 * does. Two lists offering different destinations for one row is how an
 * operator learns not to trust either.
 */
export function actionFor(item: QueueItem): TopCardAction {
  if (item.kind === "change") {
    return { label: "Review the fix", to: "/changes/$id", params: { id: item.id } };
  }
  if (item.kind === "recommendation") {
    return { label: "Review it", to: "/recommendations/$id", params: { id: item.id } };
  }
  const category = CATEGORIES.find((candidate) => candidate.id === item.categoryId);
  return { label: "See the pages", to: category?.to ?? "/" };
}

function toTopCard(item: QueueItem): TopCard | null {
  const category = CATEGORIES.find((candidate) => candidate.id === item.categoryId);
  if (!category) return null;
  return {
    id: item.id,
    category,
    // The card wears its category's icon, so the same subject looks the same
    // on the home page, in the rail and in the nav panel.
    icon: category.icon,
    title: item.title,
    kindLabel: KIND_LABEL[item.kind],
    urgencyLabel: item.urgencyLabel,
    tone: item.tone,
    evidence: item.targetUrl,
    action: actionFor(item),
    canIgnore: item.canIgnore,
  };
}

function waitingPhrase(category: Category, count: number): string {
  return `${count} ${count === 1 ? category.waiting.one : category.waiting.many}`;
}

export type StatusLine = {
  readonly text: string;
  readonly tone: "positive" | "warning" | "danger";
};

/**
 * The top bar's right-hand status, as the boards write it.
 *
 * "All systems normal" is a claim about the plumbing, not about the queue, so it
 * is said only when the plumbing really is fine: no connection whose last
 * verification failed, and no measurement run that ended in failure. When
 * something is wrong the slot names it instead, because a status light that only
 * ever reads green is not a status light.
 *
 * How much is waiting is deliberately not repeated here: the assist line and the
 * nav badges already carry it.
 */
function statusLineFor(health: CommandCenterFacts["health"]): StatusLine {
  if (health.brokenConnections > 0) {
    return {
      text:
        health.brokenConnections === 1
          ? "1 connection needs attention"
          : `${health.brokenConnections} connections need attention`,
      tone: "danger",
    };
  }
  if (health.failingProviders > 0) {
    return {
      text:
        health.failingProviders === 1
          ? "1 measurement provider is failing"
          : `${health.failingProviders} measurement providers are failing`,
      tone: "warning",
    };
  }
  // Green is a claim, and a claim needs a check behind it. Until a probe
  // has run against at least one connection, the honest line is that nothing
  // has looked (MON-4).
  if (health.connectionsChecked === 0) {
    return { text: "Connections have never been checked", tone: "warning" };
  }
  return { text: "All systems normal", tone: "positive" };
}

/**
 * Builds everything the Command center renders.
 *
 * The queue is derived once and every downstream surface reads that same
 * derivation, so the nav badge, the assist line, the cards and the suggested
 * rows can never disagree about how much is waiting.
 */
export function buildCommandCenter(facts: CommandCenterFacts): CommandCenterView {
  const queue = buildQueue(facts.queueSources, facts.now);

  const openByCategory = new Map<CategoryId, QueueItem[]>();
  for (const item of queue.open) {
    const held = openByCategory.get(item.categoryId);
    if (held) held.push(item);
    else openByCategory.set(item.categoryId, [item]);
  }

  const categories: CategoryRow[] = CATEGORIES.map((category) => {
    const items = openByCategory.get(category.id) ?? [];
    const mostUrgent = [...items].sort(compareQueueItems)[0];
    return {
      category,
      waiting: items.length,
      tone: mostUrgent ? navToneForUrgency(mostUrgent.urgency) : null,
    };
  });

  const assistLine = categories
    .filter((row) => row.waiting > 0)
    .map((row) => ({
      phrase: waitingPhrase(row.category, row.waiting),
      to: row.category.to,
    }));

  const topCards = queue.open
    .slice(0, TOP_CARDS)
    .map(toTopCard)
    .filter((card): card is TopCard => card !== null);

  const suggestedNext: SuggestedNextRow[] = [];

  if (!facts.audit.hasRun) {
    // The audit control lives on the Your pages *workspace*, not on the
    // category page in front of it: only that route imports PageAuditPanel.
    // Derived from the category so the row follows it if the route moves again.
    const pages = CATEGORIES.find((category) => category.id === "pages");
    suggestedNext.push({
      id: "run-page-audit",
      title: "Run the first page audit, because every page check is blind until it runs once",
      tone: "danger",
      // The click that spends money happens on that page, against its own
      // button; this row only takes the operator there, with the cost already
      // stated so the price is never a surprise.
      actionLabel: `Set it up · ${PAGE_AUDIT_COST}`,
      to: pages ? `${pages.to}/tools` : "/",
      metered: true,
    });
  }

  for (const row of categories) {
    if (row.waiting === 0) continue;
    suggestedNext.push({
      id: `category-${row.category.id}`,
      title: `${waitingPhrase(row.category, row.waiting)} in ${row.category.title}`,
      tone: row.tone ?? "positive",
      actionLabel: "Go through them",
      to: row.category.to,
      metered: false,
    });
  }

  return {
    property: facts.property,
    tiles: [
      googleClicksTile(facts),
      visitsTile(facts),
      fixesLiveTile(facts),
      pagesImprovedTile(facts),
      pagesNeedingFixesTile(facts),
    ],
    categories,
    assistLine,
    topCards,
    totalWaiting: queue.open.length,
    suggestedNext,
    statusLine: statusLineFor(facts.health),
    emptyHeadline: queue.open.length === 0 ? "Nothing needs you" : null,
  };
}
