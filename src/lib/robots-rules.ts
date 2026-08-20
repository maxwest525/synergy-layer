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

/** A rule path is a literal with `*` and a trailing `$`, never a full expression. */
function ruleMatches(rulePath: string, pathname: string): boolean {
  const endAnchored = rulePath.endsWith("$");
  const literal = endAnchored ? rulePath.slice(0, -1) : rulePath;
  const pattern = literal.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${pattern}${endAnchored ? "$" : ""}`).test(pathname);
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
 */
function applicableGroups(groups: readonly Group[], userAgent: string): readonly Group[] {
  const agent = userAgent.toLowerCase();
  const specificity = groups.map((group) =>
    Math.max(
      0,
      ...group.agents.filter((name) => name !== "*" && agent.includes(name)).map((n) => n.length),
    ),
  );
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
      const byLength =
        right.path.replace(/[*$]/g, "").length - left.path.replace(/[*$]/g, "").length;
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
