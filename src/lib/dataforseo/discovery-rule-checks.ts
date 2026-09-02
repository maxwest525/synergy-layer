import type { Database } from "@/integrations/supabase/types";

/**
 * Pure rule checks over already-stored Labs, Domain Analytics and Content
 * Analysis snapshots. Kept out of the .server module so they test without
 * mocks, matching pagespeed-rule-checks.ts. Nothing here reads a network or a
 * database; the .server caller supplies rows (already scoped to a tenant and,
 * for the two ownership rules, already restricted to known domains) and
 * persists results.
 *
 * Two of the five rules here file an operator DECISION, never a finding:
 * `same_registration_details_across_two_known_domains` and
 * `identical_technology_stack_across_two_known_domains` return a *candidate*
 * for the operator to confirm or reject (COMPETITIVE_MODEL.md §4, §7).
 * Nothing in this module, or in the writer that calls it, ever turns a match
 * into an asserted ownership link -- only an explicit operator confirmation
 * action does that, and it lives outside this rule engine entirely.
 */

export type DiscoveryCheckRule =
  | "overlap_list_reached_the_row_limit"
  | "same_registration_details_across_two_known_domains"
  | "identical_technology_stack_across_two_known_domains"
  | "rival_page_mentions_your_brand"
  | "brand_mentioned_without_a_link";

type ImpactLevel = Database["public"]["Enums"]["impact_level"];

export type DiscoveryFindingDraft = {
  rule:
    | "overlap_list_reached_the_row_limit"
    | "rival_page_mentions_your_brand"
    | "brand_mentioned_without_a_link";
  target: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  businessImpact: ImpactLevel;
  confidence: number;
};

/** Lower-cased, leading "www." stripped -- the same normalisation competitors.server.ts uses. */
function normaliseHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

// ---------------------------------------------------------------------------
// overlap_list_reached_the_row_limit
// ---------------------------------------------------------------------------

export type OverlapLimitSnapshot = {
  /** The seed domain the overlap lookup was run against. */
  target: string;
  possiblyTruncated: boolean;
  returnedRowCount: number;
  /** dataforseo_snapshots.request_params.limit, read defensively -- may be anything. */
  requestedLimit: unknown;
};

/**
 * Fires only on the stored `possibly_truncated` flag, never a re-derived one,
 * and only when the snapshot itself names the cap it read under -- a stale
 * copy of today's LABS_CONFIG.competitorLimit would misdescribe a snapshot
 * collected under a different value.
 */
export function checkOverlapRowLimit(snapshot: OverlapLimitSnapshot): DiscoveryFindingDraft | null {
  if (!snapshot.possiblyTruncated) return null;
  if (typeof snapshot.requestedLimit !== "number" || !Number.isFinite(snapshot.requestedLimit)) {
    return null;
  }
  const limit = Math.trunc(snapshot.requestedLimit);
  if (limit <= 0) return null;

  return {
    rule: "overlap_list_reached_the_row_limit",
    target: snapshot.target,
    title: `The overlap lookup for ${snapshot.target} came back full`,
    description:
      `This lookup asked for at most ${limit} sites and ${limit} came back, so the list may be the ` +
      `first ones the provider had rather than every overlapping site. Your own site is not listed. ` +
      `Read it as a sample.`,
    evidence: {
      seedDomain: snapshot.target,
      requestedLimit: limit,
      returnedRowCount: snapshot.returnedRowCount,
      possiblyTruncated: true,
    },
    businessImpact: "low",
    confidence: 1,
  };
}

// ---------------------------------------------------------------------------
// rival_page_mentions_your_brand
// ---------------------------------------------------------------------------

export type RivalMentionRow = {
  url: string;
  domain: string | null;
  title: string | null;
  datePublished: string | null;
};

export type RivalMentionsInput = {
  mentions: readonly RivalMentionRow[];
  /** Already normalised (normaliseHost / normaliseDomain), already filtered to active/reviewed. */
  knownCompetitorDomains: ReadonlySet<string>;
  /** Rows the provider sent with no readable URL -- named, never dropped to zero. */
  unparsedCount: number;
  possiblyTruncated: boolean;
};

/** "2026-08-01 00:00:00 +00:00" (or a bare date) -> "1 August". Falls back to the raw string. */
function formatPublishedDate(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(parsed);
}

/**
 * One finding per mention URL whose domain is already known as a competitor.
 * A missing title or date drops that clause entirely rather than filling it
 * with a guess (finding-copy.ts's rule); the claim still stands on the URL.
 */
export function checkRivalPageMentions(input: RivalMentionsInput): DiscoveryFindingDraft[] {
  const seenUrls = new Set<string>();
  const drafts: DiscoveryFindingDraft[] = [];

  for (const mention of input.mentions) {
    if (!mention.url || seenUrls.has(mention.url)) continue;
    if (mention.domain === null) continue;
    const domain = normaliseHost(mention.domain);
    if (!input.knownCompetitorDomains.has(domain)) continue;
    seenUrls.add(mention.url);

    const titleClause = mention.title !== null ? `: "${mention.title}"` : "";
    const dateClause =
      mention.datePublished !== null
        ? `, published ${formatPublishedDate(mention.datePublished)}`
        : "";
    const truncationClause = input.possiblyTruncated
      ? " This reading stopped at the first page of results the search covered, so a page saying nothing here is not the same as none existing."
      : "";

    drafts.push({
      rule: "rival_page_mentions_your_brand",
      target: mention.url,
      title: "A site that ranks alongside you mentions your name",
      description:
        `A page on a site that ranks alongside you mentions your name${titleClause}${dateClause}. ` +
        `The match is on your brand word appearing in the page text, so read it before treating it ` +
        `as a comparison of you.${truncationClause}`,
      evidence: {
        url: mention.url,
        domain: mention.domain,
        title: mention.title,
        datePublished: mention.datePublished,
        possiblyTruncated: input.possiblyTruncated,
        // Named, never folded into a count of matches: a row with no URL is
        // unread, not absent.
        unparsedItemCount: input.unparsedCount,
      },
      businessImpact: "low",
      confidence: 1,
    });
  }

  return drafts;
}

// ---------------------------------------------------------------------------
// brand_mentioned_without_a_link
// ---------------------------------------------------------------------------

export type UnlinkedMentionsInput = {
  mentions: readonly RivalMentionRow[];
  /** Hosts of the tenant's own website assets, normalised. A self-mention is not outreach. */
  ownedHosts: ReadonlySet<string>;
  /** Already normalised; these domains have their own rule (rival_page_mentions_your_brand). */
  knownCompetitorDomains: ReadonlySet<string>;
  /** Domains in the newest stored referring-domain read, normalised. */
  referringDomains: ReadonlySet<string>;
  /** Rank-ordered rows the referring-domain read returned, and the limit it was asked for. */
  referringDomainsReturned: number;
  referringDomainsLimit: number;
  referringDomainsReportingDate: string;
  /** True when the read filled its limit, so a domain absent from it may still link. */
  referringDomainsPossiblyTruncated: boolean;
  /** Rows the provider sent with no readable URL -- named, never dropped to zero. */
  unparsedCount: number;
  mentionsPossiblyTruncated: boolean;
};

/**
 * One finding per domain that mentions the brand and is not in the stored
 * referring-domain list: the set difference LINK-3 named. The claim is exactly
 * what was compared, so when the referring-domain read was cut off at its
 * limit the sentence says "not among the first N linking domains by rank"
 * rather than "does not link". Owned hosts and known competitors are left
 * out: the first is not outreach, the second has its own rule.
 */
export function checkUnlinkedBrandMentions(input: UnlinkedMentionsInput): DiscoveryFindingDraft[] {
  const urlsByDomain = new Map<string, string[]>();
  let domainlessCount = 0;

  for (const mention of input.mentions) {
    if (!mention.url) continue;
    if (mention.domain === null) {
      domainlessCount += 1;
      continue;
    }
    const domain = normaliseHost(mention.domain);
    if (!domain || input.ownedHosts.has(domain) || input.knownCompetitorDomains.has(domain)) {
      continue;
    }
    if (input.referringDomains.has(domain)) continue;
    const urls = urlsByDomain.get(domain) ?? [];
    if (!urls.includes(mention.url)) urls.push(mention.url);
    urlsByDomain.set(domain, urls);
  }

  const linkListClause = input.referringDomainsPossiblyTruncated
    ? `is not among the first ${input.referringDomainsReturned} domains linking to you by rank, which is where the stored read stopped, so it may link from a lower-ranked page`
    : `is not among the ${input.referringDomainsReturned} domains the stored read found linking to you`;
  const mentionTruncationClause = input.mentionsPossiblyTruncated
    ? " The mention reading stopped at the first page of results the search covered, so a domain missing here is not the same as none existing."
    : "";

  const drafts: DiscoveryFindingDraft[] = [];
  for (const [domain, urls] of urlsByDomain) {
    const pageClause = urls.length === 1 ? "one page" : `${urls.length} pages`;
    drafts.push({
      rule: "brand_mentioned_without_a_link",
      target: domain,
      title: "A site mentions your name without a link we can see",
      description:
        `${domain} mentions your name on ${pageClause} and ${linkListClause} ` +
        `(referring domains read ${input.referringDomainsReportingDate}). ` +
        `The match is on your brand word appearing in the page text; read the page before asking for a link.` +
        mentionTruncationClause,
      evidence: {
        domain,
        urls,
        referringDomainsReturned: input.referringDomainsReturned,
        referringDomainsLimit: input.referringDomainsLimit,
        referringDomainsReportingDate: input.referringDomainsReportingDate,
        referringDomainsPossiblyTruncated: input.referringDomainsPossiblyTruncated,
        mentionsPossiblyTruncated: input.mentionsPossiblyTruncated,
        // Named, never folded into a count of matches: a row with no URL or
        // no domain is unread, not absent.
        unparsedItemCount: input.unparsedCount,
        domainlessMentionCount: domainlessCount,
      },
      businessImpact: "low",
      confidence: 1,
    });
  }

  return drafts;
}

// ---------------------------------------------------------------------------
// same_registration_details_across_two_known_domains (operator DECISION)
// ---------------------------------------------------------------------------

export type WhoisRow = {
  domain: string;
  registrar: string | null;
  createdDatetime: string | null;
  expirationDatetime: string | null;
};

export type RegistrationMatchField = "registrar" | "createdDatetime" | "expirationDatetime";

export type RegistrationMatch = {
  field: RegistrationMatchField;
  value: string;
  /** How many domains in the read set share this exact value, including the pair itself. */
  cohortCount: number;
  /** How many domains in the read set carry a value for this field at all. */
  cohortSize: number;
};

export type RegistrationCandidateDraft = {
  rule: "same_registration_details_across_two_known_domains";
  domainA: string;
  domainB: string;
  matchedFields: RegistrationMatch[];
};

const REGISTRATION_FIELDS: readonly RegistrationMatchField[] = [
  "registrar",
  "createdDatetime",
  "expirationDatetime",
];

function presentString(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * One candidate per pair of domains, carrying every field that matched --
 * never one row per pair per field. A value is only ever compared against
 * another present value: two domains both missing the same field are a named
 * absence, not a match, so they never reach this function's output.
 *
 * `rows` must already be restricted to the tenant's known domains (tracked
 * competitors and reviewed candidates) and deduplicated to the newest whois
 * row per domain -- both the caller's job, matching how every other check
 * module here takes pre-filtered rows.
 */
export function checkSameRegistrationDetails(
  rows: readonly WhoisRow[],
): RegistrationCandidateDraft[] {
  const byDomain = new Map<string, WhoisRow>();
  for (const row of rows) {
    const domain = normaliseHost(row.domain);
    if (domain) byDomain.set(domain, { ...row, domain });
  }
  const domains = [...byDomain.keys()].sort();

  const cohortsByField: Record<RegistrationMatchField, Map<string, string[]>> = {
    registrar: new Map(),
    createdDatetime: new Map(),
    expirationDatetime: new Map(),
  };
  const cohortSizeByField: Record<RegistrationMatchField, number> = {
    registrar: 0,
    createdDatetime: 0,
    expirationDatetime: 0,
  };

  for (const domain of domains) {
    const row = byDomain.get(domain)!;
    for (const field of REGISTRATION_FIELDS) {
      const value = row[field];
      if (!presentString(value)) continue;
      cohortSizeByField[field] += 1;
      const list = cohortsByField[field].get(value) ?? [];
      list.push(domain);
      cohortsByField[field].set(value, list);
    }
  }

  const drafts: RegistrationCandidateDraft[] = [];
  for (let i = 0; i < domains.length; i += 1) {
    for (let j = i + 1; j < domains.length; j += 1) {
      const domainA = domains[i]!;
      const domainB = domains[j]!;
      const rowA = byDomain.get(domainA)!;
      const rowB = byDomain.get(domainB)!;
      const matchedFields: RegistrationMatch[] = [];

      for (const field of REGISTRATION_FIELDS) {
        const valueA = rowA[field];
        const valueB = rowB[field];
        if (!presentString(valueA) || !presentString(valueB)) continue;
        if (valueA !== valueB) continue;
        matchedFields.push({
          field,
          value: valueA,
          cohortCount: cohortsByField[field].get(valueA)?.length ?? 0,
          cohortSize: cohortSizeByField[field],
        });
      }

      if (matchedFields.length > 0) {
        drafts.push({
          rule: "same_registration_details_across_two_known_domains",
          domainA,
          domainB,
          matchedFields,
        });
      }
    }
  }

  return drafts;
}

/**
 * Known domains with no stored whois row at all. Named so the operator reads
 * "no registration record has been collected for it", never "no link was
 * found" -- an absence is not a clean comparison.
 */
export function domainsMissingWhoisRecord(
  knownDomains: readonly string[],
  rows: readonly WhoisRow[],
): string[] {
  const read = new Set(rows.map((row) => normaliseHost(row.domain)));
  return [...new Set(knownDomains.map(normaliseHost))].filter((domain) => !read.has(domain)).sort();
}

// ---------------------------------------------------------------------------
// identical_technology_stack_across_two_known_domains (operator DECISION)
// ---------------------------------------------------------------------------

export type TechnologyRow = {
  domain: string;
  technologies: Record<string, unknown> | null;
  lastVisited: string | null;
};

export type TechnologyCandidateDraft = {
  rule: "identical_technology_stack_across_two_known_domains";
  domainA: string;
  domainB: string;
  /** How many named technologies the shared stack carries -- not a fingerprint, a plain count. */
  sharedTechnologyCount: number;
  /** How many known domains carry this exact stack, including the pair itself. */
  cohortSize: number;
  lastVisitedA: string | null;
  lastVisitedB: string | null;
  /** No graded staleness cutoff -- just whether the two reads happened on the same day. */
  freshness: "same_day" | "different_days" | "unknown";
};

/** Same normalisation shape as transport.server.ts's checksum() input, kept local so this pure module never imports the .server transport layer. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function canonicalStackKey(technologies: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(technologies));
}

/** Every leaf string value, counted -- {content:{cms:["WordPress"]}} is one named technology. */
function countNamedTechnologies(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((total: number, entry) => total + countNamedTechnologies(entry), 0);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).reduce(
      (total: number, entry) => total + countNamedTechnologies(entry),
      0,
    );
  }
  return typeof value === "string" ? 1 : 0;
}

function hasNamedTechnology(
  technologies: Record<string, unknown> | null,
): technologies is Record<string, unknown> {
  return technologies !== null && countNamedTechnologies(technologies) > 0;
}

function sameCalendarDay(
  a: string | null,
  b: string | null,
): "same_day" | "different_days" | "unknown" {
  if (a === null || b === null) return "unknown";
  const dayA = a.slice(0, 10);
  const dayB = b.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayA) || !/^\d{4}-\d{2}-\d{2}$/.test(dayB)) return "unknown";
  return dayA === dayB ? "same_day" : "different_days";
}

/**
 * One candidate per pair of domains whose stored technology stack is exactly
 * equal. A missing or empty stack is excluded before any pair is formed --
 * `checksum({}) === checksum({})` must never read as a match, and an absent
 * `technologies` key must never throw.
 *
 * `rows` must already be the newest technology read per known domain -- the
 * caller's job, matching checkSameRegistrationDetails.
 */
export function checkIdenticalTechnologyStack(
  rows: readonly TechnologyRow[],
): TechnologyCandidateDraft[] {
  const byDomain = new Map<string, TechnologyRow>();
  for (const row of rows) {
    const domain = normaliseHost(row.domain);
    if (domain) byDomain.set(domain, { ...row, domain });
  }

  const groups = new Map<string, string[]>();
  for (const [domain, row] of byDomain) {
    if (!hasNamedTechnology(row.technologies)) continue;
    const key = canonicalStackKey(row.technologies);
    const list = groups.get(key) ?? [];
    list.push(domain);
    groups.set(key, list);
  }

  const drafts: TechnologyCandidateDraft[] = [];
  for (const domains of groups.values()) {
    if (domains.length < 2) continue;
    const sorted = [...domains].sort();
    const sharedTechnologyCount = countNamedTechnologies(byDomain.get(sorted[0]!)!.technologies);

    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const domainA = sorted[i]!;
        const domainB = sorted[j]!;
        const rowA = byDomain.get(domainA)!;
        const rowB = byDomain.get(domainB)!;
        drafts.push({
          rule: "identical_technology_stack_across_two_known_domains",
          domainA,
          domainB,
          sharedTechnologyCount,
          cohortSize: sorted.length,
          lastVisitedA: rowA.lastVisited,
          lastVisitedB: rowB.lastVisited,
          freshness: sameCalendarDay(rowA.lastVisited, rowB.lastVisited),
        });
      }
    }
  }

  return drafts;
}

/** Known domains whose stored technology read came back with nothing named -- an absence, not a match half. */
export function domainsWithNoTechnologyRecorded(rows: readonly TechnologyRow[]): TechnologyRow[] {
  return rows.filter((row) => !hasNamedTechnology(row.technologies));
}
