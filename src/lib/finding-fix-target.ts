/**
 * Which governed lane, if any, can draft the fix for a rule finding, and which
 * page that fix targets. Pure so it tests without mocks.
 *
 * This file used to answer the lane question with one line:
 *
 *     return rule === "weak_ctr_page" ? "page_metadata" : "page_wording";
 *
 * so every finding except one drafted a rewrite of the page's words. That was
 * not a judgement about those findings; it was the first lane built becoming
 * the default for everything after it. A page that has never appeared in
 * search got its title rewritten. A page that lost a ranking got its title
 * rewritten. The system had one answer and applied it to every question.
 *
 * The map below replaces that. A rule appears in FIX_LANES only when the lane
 * genuinely answers it, and the reason is written down beside it. Everything
 * else has no lane and says so on screen, because a button that drafts the
 * wrong kind of fix is worse than no button: it spends an operator's approval
 * on a change that could not have worked.
 *
 * Fewer rules offer a draft after this change than before. That is the point.
 */

type PageQueryRow = {
  keys?: string[];
  impressions: number;
};

export type FixProposalKind = "page_wording" | "page_metadata";

/** How the finding's stored target resolves to a page. */
type Targeting = "page" | "query" | "page_and_query";

type FixLane = {
  readonly proposalKind: FixProposalKind;
  readonly targeting: Targeting;
  /** Developer-facing. Why this lane answers this finding. Never rendered. */
  readonly because: string;
};

/**
 * The rules a governed lane can actually answer.
 *
 * Adding a rule here is a claim that editing that lane's field would change
 * the thing the rule measured. If it would not, leave it out and give it a
 * sentence in NO_LANE_REASON instead.
 */
const FIX_LANES: Readonly<Record<string, FixLane>> = {
  weak_ctr_page: {
    proposalKind: "page_metadata",
    targeting: "page",
    because:
      "The page is being shown and not chosen. What a searcher reads before choosing is the snippet, and the description is the part of the snippet a site controls.",
  },
  query_coverage_gap: {
    proposalKind: "page_wording",
    targeting: "page_and_query",
    because:
      "The page already earns impressions for a term its wording does not address. Making the page say what it is about is exactly a wording change.",
  },
  striking_distance_query: {
    proposalKind: "page_wording",
    targeting: "query",
    because:
      "The page ranks just off the first results for this term. Wording is the lever a site controls that can make a page read as more clearly about it.",
  },
  possible_query_overlap: {
    proposalKind: "page_wording",
    targeting: "query",
    because:
      "Two pages compete for the same term. Differentiating what each page says is a wording change; which page should win is left to the operator.",
  },
};

/**
 * Rules that deliberately have no draft, and the sentence the operator reads
 * where they would expect a button. Plain words, per the copy rules.
 *
 * These four previously drafted a page-wording rewrite. Each is here because
 * rewriting words could not have fixed what the rule found.
 */
const NO_LANE_REASON: Readonly<Record<string, string>> = {
  zero_impression_page:
    "This page has never been shown in search at all, so changing its words would change nothing. What it needs first is to be reachable and listed: check that nothing blocks it and that your sitemap includes it.",
  index_coverage_drift:
    "Google changed how it treats this page. That is a decision about whether the page is included, not about how it is worded, so there is no wording fix to draft here.",
  visibility_gain:
    "This page is doing better than it was. There is nothing to correct, so no fix is offered.",
  position_loss:
    "This page lost ground for this term, and the cause is not in the evidence: it could be a competitor's change, a shift in what people search for, or something on the page. Drafting a rewrite here would be a guess.",
};

/**
 * Whether a rule finding has a governed lane that can draft its fix.
 *
 * The one answer to that question. A surface offering "Draft the fix" reads it
 * rather than keeping its own list, because two lists is how a button appears
 * for a rule the server then refuses.
 */
export function hasGovernedFixPath(rule: string): boolean {
  return rule in FIX_LANES;
}

/**
 * Why a finding offers no draft, for the sentence that stands where a control
 * would be. Null when the rule does have a lane.
 */
export function whyNoFixLane(rule: string): string | null {
  if (rule in FIX_LANES) return null;
  return (
    NO_LANE_REASON[rule] ??
    "There is no governed fix for this finding yet, so it is reported for you to act on directly."
  );
}

/**
 * Which governed proposal lane drafts the fix for a rule finding, or null when
 * none does. Callers must handle null rather than falling back to a default:
 * a default is what made every finding a title rewrite.
 */
export function proposalKindForRule(rule: string): FixProposalKind | null {
  return FIX_LANES[rule]?.proposalKind ?? null;
}

export type FixTarget =
  { ok: true; url: string; query: string | null } | { ok: false; reason: string };

export function deriveFixTarget(
  rule: string,
  target: string,
  pageQueryRows: PageQueryRow[],
): FixTarget {
  const lane = FIX_LANES[rule];
  if (!lane) {
    return { ok: false, reason: whyNoFixLane(rule) ?? `Rule "${rule}" has no governed fix path.` };
  }

  if (lane.targeting === "page_and_query") {
    const [page, query] = target.split(" :: ");
    if (!page || !page.startsWith("http")) {
      return { ok: false, reason: `The finding target "${target}" holds no page URL.` };
    }
    return { ok: true, url: page, query: query ?? null };
  }

  if (lane.targeting === "page") {
    if (!target.startsWith("http")) {
      return { ok: false, reason: `The finding target "${target}" is not a page URL.` };
    }
    return { ok: true, url: target, query: null };
  }

  let best: { url: string; impressions: number } | null = null;
  for (const row of pageQueryRows) {
    const page = row.keys?.[0];
    const query = row.keys?.[1];
    if (!page || query !== target) continue;
    if (!best || row.impressions > best.impressions) {
      best = { url: page, impressions: row.impressions };
    }
  }
  if (!best) {
    return {
      ok: false,
      reason: `No stored page earns impressions for "${target}", so there is no page to fix yet.`,
    };
  }
  return { ok: true, url: best.url, query: target };
}
