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
  high_impression_low_ctr: {
    proposalKind: "page_metadata",
    targeting: "page",
    because:
      "The same measurement as weak_ctr_page, under a different producer: both fire at 200 impressions and a CTR at or below 1%. Identical evidence cannot honestly get a fix on one screen and a shrug on the other, so it gets the same lane -- the description is what a searcher reads before choosing.",
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
  serp_rotation:
    "Which of your pages should answer this query is a decision about what each page is for, and the remedy differs by case: a commercial and an informational page usually want canonicalisation rather than a merge and a redirect. Nothing here can make that choice, so the dates and the pages are reported and the call is left to you.",
  zero_impression_page:
    "This page has never been shown in search at all, so changing its words would change nothing. What it needs first is to be reachable and listed: check that nothing blocks it and that your sitemap includes it.",
  index_coverage_drift:
    "Google changed how it treats this page. That is a decision about whether the page is included, not about how it is worded, so there is no wording fix to draft here.",
  visibility_gain:
    "This page is doing better than it was. There is nothing to correct, so no fix is offered.",
  position_loss:
    "This page lost ground for this term, and the cause is not in the evidence: it could be a competitor's change, a shift in what people search for, or something on the page. Drafting a rewrite here would be a guess.",

  // The one genuinely ambiguous case, so it says so rather than guessing.
  // Above 200 impressions weak_ctr_page and high_impression_low_ctr fire on the
  // same page and do offer the description draft; between 150 and 200 this
  // fires alone, and at zero clicks "nobody chose it" and "nobody could see it"
  // look identical in this evidence.
  zero_click_page:
    "This page was shown and never clicked. That is either the description not earning the click, or the page sitting too far down to be seen at all, and these numbers cannot tell the two apart. Check its position first: if it is on the first page of results, the description is the lever, and the same page will offer that draft once it clears 200 impressions.",

  // Speed and layout. Real defects, measured against Google's own bands, and
  // not one of them is answerable by editing words.
  page_lcp_poor:
    "This page is slow to show its main content. That comes from image sizes, server response time, and scripts that block the page from drawing -- none of which change when the words do.",
  page_cls_poor:
    "Things move around while this page loads, so people tap the wrong thing. The cause is layout: images and embeds that do not reserve their space before they arrive. Rewriting the words would not hold the page still.",

  // Falls and rises where the evidence names the size of the change and not
  // its cause. Offering a rewrite here would be inventing a diagnosis.
  declining_clicks:
    "Fewer people clicked through to this page. The evidence does not say why -- it could be position, a competitor, the season, or simply fewer people searching. There is nothing specific enough here to draft.",
  declining_impressions:
    "This page was shown less often. That is about how often it is eligible to appear at all, which is not something its wording decides.",
  declining_position:
    "This page slipped for this term. As with any drop in position, the cause is not in the evidence, so a rewrite would be a guess.",
  significant_period_change:
    "Something moved sharply here, up or down. The rule reports how big the change was, not what caused it, so there is nothing to correct yet.",
  research_page_traction:
    "This page is gaining ground. There is nothing to correct, so no fix is offered.",

  // Whole-property readings. True, useful, and about no single page.
  site_visibility_shift:
    "This is a reading for the whole site, not one page. There is no single page to edit.",
  site_clicks_shift:
    "This is a reading for the whole site, not one page. There is no single page to edit.",

  // Analytics behaviour. A visit can arrive from anywhere, so search wording is
  // one candidate cause among many.
  page_traffic_loss:
    "Visits to this page fell. Visits arrive from every channel, not just search, so the page's wording is one possible cause among many and not the one to assume.",
  page_traffic_gain: "Visits to this page grew. There is nothing to correct.",
  zero_engagement_page:
    "People reach this page and then do nothing. That is about what the page offers and how it is laid out, which is a larger change than editing a line.",
  event_disappeared:
    "Something that used to be recorded here has stopped being recorded. That is far more often tracking that broke than content that changed. Check the tag or the form before changing the page.",
  event_silent_yesterday:
    "An event that fired every day recorded nothing yesterday. That is a tag, a trigger or a form to check today, not a page to edit; if it was a real quiet day, tomorrow's read will say so.",

  // Targeting and links. Nothing is wrong with a page in any of these.
  approved_keyword_unobserved:
    "No search result has ever been collected for this term, so nothing is known to be wrong with any page. The term needs looking up, not fixing.",
  approved_keyword_no_page:
    "No page is mapped to this term. It needs a page, which is a decision about what to publish rather than an edit to something that exists.",
  referring_domain_movement:
    "The sites linking to you changed. Those are other people's pages, and nothing here can edit them.",
  approved_keyword_multiple_pages:
    "More than one of your own pages targets this term. Fixing that means deciding which page should own it and rewording the rest -- a call this tool will not make for you.",
  tracked_set_has_no_route_query:
    "Searches that name a journey already reach the site and none of the approved keywords is one. Choosing which route queries to track is a decision about what to target, not an edit to a page; the searches are listed for you to pick from, and nothing is approved on your behalf.",

  // The site crawl. Errors, redirects and index blocks are answered in hosting,
  // routing and directives, not in a page's words. Where a governed draft does
  // exist (robots.txt on Site health) the sentence points at it.
  crawl_pages_error_status:
    "Some addresses the site check followed answered with an error instead of a page. That is fixed on the server or in the site's routing, by restoring the page or redirecting the address, not by editing words on a page that is not answering.",
  redirect_chain_present:
    "Some addresses redirect before a page answers. Redirects live in the site's hosting and routing configuration, which no governed lane edits yet; the fix is to link straight to the final address and remove the extra hop.",
  non_indexable_pages_found:
    "Some pages are set up so Google will not list them. Where that comes from robots.txt, Site health offers a governed draft of the directive. Where it comes from a noindex tag or a canonical pointing elsewhere, it is a decision about which pages should be listed, and changing the words would not change it.",
  duplicate_titles_across_pages:
    "Several pages share the same title. Fixing that means deciding which page keeps it and giving the others their own, and that choice is yours. Once you pick a page, its own findings offer the wording draft.",
  duplicate_descriptions_across_pages:
    "Several pages share the same description, usually because they all fall back to the sitewide default. A page that should say something of its own needs its own edit, and which pages deserve one is your call.",

  // The nightly live-site read. What changed overnight is answered in hosting,
  // routing or the page's directives, never in its words.
  page_stopped_answering:
    "This address answered a page one night and an error the next. That is fixed on the server or in the site's routing, by restoring the page or redirecting the address, not by editing words on a page that is not answering.",
  page_went_noindex:
    "This page told crawlers not to list it last night and did not the night before. Whether it should be listed is a decision about the page's directives, not its wording; remove the directive if the page belongs in search results.",
  page_canonical_changed:
    "This page now names a different address as its original. Which address should be the original is a decision about the site's structure, not a wording change; restore the earlier canonical if the change was not intended.",

  // Links from other sites. The link is theirs; the address is yours.
  inbound_link_to_error_page:
    "Other sites link to a page that answers with an error. The link is theirs; what you control is the address, so the fix is to restore the page or redirect that address to the right one, which lives in hosting and routing rather than in page wording.",
  linked_page_never_audited:
    "Other sites link to a page the audit has never read. Nothing is known to be wrong with it yet. Run the page audit on it first, and its own findings will say what, if anything, to change.",
  link_profile_coverage_partial:
    "The link check only read your top linking sites, so this is a limit of the reading, not a problem with a page. A fuller read is a provider request, made on a click with its cost shown.",

  // Self-hosted analytics. Every one of these is about the tag or the source,
  // never about the words on a page.
  umami_zero_recorded:
    "Your analytics instance recorded nothing for the site. That is almost always the tag missing or blocked, not the content. Check the tracking script on the site before changing anything else.",
  umami_site_traffic_shift:
    "Visits to the site moved between two windows. The reading names the size of the change, not its cause, and visits arrive from every channel, so there is nothing specific enough to draft.",
  umami_referrer_source_stopped:
    "Visits from one source stopped arriving. That source is another site or platform. Check whether it still links or lists you, which is outreach rather than a page edit.",

  // Competitor discovery. Facts about other people's sites and about the
  // reading itself. Nothing here is a change to your pages.
  overlap_list_reached_the_row_limit:
    "The competitor overlap lookup came back full, so the list is cut off rather than complete. A fuller read is a provider request, made on a click with its cost shown. Nothing on your pages needs changing for it.",
  rival_page_mentions_your_brand:
    "A site that ranks alongside you mentions your name. That page is theirs. What you can do is read what it says and decide whether to respond, ask for a link, or correct a claim, none of which this tool drafts.",
  brand_mentioned_without_a_link:
    "A site mentions your name and is not in the stored list of sites linking to you. The page is theirs, so the move is outreach: read what it says, then ask for a link if the mention deserves one. Nothing on your pages changes for it, and this tool drafts no message.",
  same_registration_details_across_two_known_domains:
    "Two domains you track share registration details, which may mean one owner behind both. It is filed as a candidate for review. Confirming it is a judgement about competitors, and it changes nothing on your site.",
  identical_technology_stack_across_two_known_domains:
    "Two domains you track run the same technology, which may mean one owner behind both. It is filed as a candidate for review. Confirming it is a judgement about competitors, and it changes nothing on your site.",
};

/**
 * The fallback for a rule nobody has written a reason for. A registered rule
 * must never reach it: finding-fix-target.test.ts walks RULE_ASSIGNMENTS and
 * fails the build if one does, because a generic sentence where an operator
 * expected a control is the dead-card pattern this file exists to stop.
 */
export const GENERIC_NO_LANE_SENTENCE =
  "There is no governed fix for this finding yet, so it is reported for you to act on directly.";

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
  return NO_LANE_REASON[rule] ?? GENERIC_NO_LANE_SENTENCE;
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
