/**
 * Whether robots.txt lets a crawler fetch one path.
 *
 * `robotsBlocksEverything` in `site-checks.ts` only ever matched a bare
 * `Disallow: /`, so a robots.txt hiding half the site read as perfectly
 * healthy. This is the real matcher, ported from the operator's `dexter` repo,
 * and it decides two different things:
 *
 *   - the finding: "robots.txt disallows 9 of your 40 pages from being crawled"
 *   - the spend: the page audit stops paying to scrape pages Google is not
 *     allowed to read in the first place
 *
 * It implements the parts of Google's specification that change the answer:
 * per-user-agent groups with specificity, `*` wildcards, `$` end anchors,
 * longest-match precedence, and allow winning a tie. Anything it cannot parse
 * is treated as permitting the fetch, matching the specification's own
 * fail-open posture: a malformed file must not silently hide a whole site.
 */

const DEFAULT_USER_AGENT = "Googlebot";

type Rule = { readonly type: "allow" | "disallow"; readonly path: string };
type Group = { readonly agents: readonly string[]; readonly rules: readonly Rule[] };

/**
 * Whether one rule path matches one address.
 *
 * A rule path is a literal with `*` wildcards and an optional trailing `$`,
 * never a full expression. This walks the literal segments between the
 * wildcards in one pass rather than compiling a regular expression, because
 * `*` compiled to `.*` backtracks catastrophically: a thirty character
 * `Disallow` line took forty seconds against a forty character path, and the
 * body is re-read from storage on every audit read, so one such line would
 * hang the route permanently rather than once.
 *
 * Matching each segment at its earliest possible position is safe here.
 * Accepting a later occurrence can never rescue a match that the earliest one
 * fails, because everything after it is preceded by an unbounded wildcard.
 */
function ruleMatches(rulePath: string, pathname: string): boolean {
  const endAnchored = rulePath.endsWith("$");
  const literal = endAnchored ? rulePath.slice(0, -1) : rulePath;
  const segments = literal.split("*");
  const last = segments[segments.length - 1] ?? "";
  // A rule ending `*$` anchors nothing: the wildcard already absorbs the tail.
  const anchorEnd = endAnchored && last !== "";

  // The first segment is anchored at the start, always.
  const first = segments[0] ?? "";
  if (!pathname.startsWith(first)) return false;
  let at = first.length;

  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index] ?? "";
    if (segment === "") continue;
    if (anchorEnd && index === segments.length - 1) {
      const start = pathname.length - segment.length;
      if (start < at || !pathname.startsWith(segment, start)) return false;
      at = pathname.length;
      continue;
    }
    const found = pathname.indexOf(segment, at);
    if (found === -1) return false;
    at = found + segment.length;
  }

  return !anchorEnd || at === pathname.length;
}

function parseGroups(content: string): Group[] {
  const groups: Group[] = [];
  let agents: string[] = [];
  let rules: Rule[] = [];

  const flush = () => {
    if (agents.length > 0) groups.push({ agents, rules });
    agents = [];
    rules = [];
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = (rawLine.split("#", 1)[0] ?? "").trim();
    if (line === "" || !line.includes(":")) continue;
    const [rawKey, ...rawValue] = line.split(":");
    const key = (rawKey ?? "").trim().toLowerCase();
    const value = rawValue.join(":").trim();

    if (key === "user-agent") {
      // A new agent after rules have accumulated starts a new group.
      if (rules.length > 0) flush();
      if (value !== "") agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && agents.length > 0) {
      rules.push({ type: key, path: value });
    }
  }
  flush();
  return groups;
}

/**
 * The groups that apply to this crawler.
 *
 * A group naming the crawler beats the wildcard group entirely, and the longest
 * matching name wins among several, so `Googlebot-Image` is not governed by a
 * `Googlebot` group when its own exists.
 *
 * The token has to match exactly, or as the family prefix of a hyphenated name.
 * Matching it as a substring looks equivalent and is not: `Googlebot` contains
 * `bot`, so a `User-agent: bot` group — or a bare `Crawl-delay` courtesy group
 * naming one — would displace the wildcard group and decide the whole file.
 * That reads as either every page blocked or every rule ignored, and both were
 * reproducible against ordinary robots.txt files.
 */
function applicableGroups(groups: readonly Group[], userAgent: string): readonly Group[] {
  const agent = userAgent.toLowerCase();
  const names = (group: Group) =>
    group.agents.filter((name) => name !== "*" && (agent === name || agent.startsWith(`${name}-`)));
  const specificity = groups.map((group) => Math.max(0, ...names(group).map((n) => n.length)));
  const strongest = Math.max(0, ...specificity);
  return strongest > 0
    ? groups.filter((_group, index) => specificity[index] === strongest)
    : groups.filter((group) => group.agents.includes("*"));
}

export function isRobotsPathAllowed(
  content: string,
  pathname: string,
  userAgent: string = DEFAULT_USER_AGENT,
): boolean {
  if (content.trim() === "") return true;

  const matches = applicableGroups(parseGroups(content), userAgent)
    .flatMap((group) => group.rules)
    // An empty path is not a rule: `Disallow:` with no value allows everything.
    .filter((rule) => rule.path !== "" && ruleMatches(rule.path, pathname))
    .sort((left, right) => {
      // Raw length, wildcards and anchor included, as the specification says.
      // Stripping them made `Disallow: /$` measure shorter than `Allow: /`, so
      // the standard "block only the homepage" rule lost and the homepage read
      // as crawlable.
      const byLength = right.path.length - left.path.length;
      if (byLength !== 0) return byLength;
      // Equal length: allow wins, as the specification requires.
      return left.type === "allow" ? -1 : 1;
    });

  return matches.length === 0 || matches[0]?.type === "allow";
}

/**
 * The pages robots.txt blocks, from a set the audit knows about.
 *
 * Returned as the paths themselves rather than a count, so the finding can name
 * them instead of asserting a number the operator cannot check.
 */
export function blockedPaths(
  content: string,
  paths: readonly string[],
  userAgent: string = DEFAULT_USER_AGENT,
): readonly string[] {
  return paths.filter((path) => !isRobotsPathAllowed(content, path, userAgent));
}
