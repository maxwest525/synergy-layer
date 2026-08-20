/**
 * One taxonomy for the whole OS. The sidebar, page headers, and the action
 * center all read their group names and their order from here, so a workspace
 * cannot belong to two places or be silently uncategorised.
 *
 * The order is the loop a day actually runs in: something is waiting on a
 * decision, the decision rests on stored evidence, evidence comes from work
 * that ran, and system health is only consulted when a stage cannot complete.
 */
export type TaxonomyGroupKey = "decisions" | "evidence" | "run_work" | "system_health";

export type TaxonomyGroup = {
  key: TaxonomyGroupKey;
  label: string;
  /** One line explaining what belongs in the group. */
  definition: string;
  /** Where the loop continues after this stage. */
  nextStage: string;
};

export const TAXONOMY_GROUPS: readonly TaxonomyGroup[] = [
  {
    key: "decisions",
    label: "Decisions",
    definition: "Something is waiting on your yes or no.",
    nextStage: "Approved work moves into Run work, then proves itself in Evidence.",
  },
  {
    key: "evidence",
    label: "Evidence",
    definition: "Stored facts that decisions rest on.",
    nextStage: "Evidence that looks wrong raises a proposal in Decisions.",
  },
  {
    key: "run_work",
    label: "Run work",
    definition: "The automations and tools that produce evidence and changes.",
    nextStage: "Every run either stores new evidence or executes an approved change.",
  },
  {
    key: "system_health",
    label: "System health",
    definition: "Connections, costs, and access. Only when something breaks.",
    nextStage: "Fixing a connection lets the stage that failed run again.",
  },
] as const;

export const TAXONOMY_GROUP_BY_KEY: Record<TaxonomyGroupKey, TaxonomyGroup> = Object.fromEntries(
  TAXONOMY_GROUPS.map((group) => [group.key, group]),
) as Record<TaxonomyGroupKey, TaxonomyGroup>;

/**
 * Route path to group. Longest matching prefix wins, so detail routes inherit
 * their list route's group without needing their own entry.
 */
export const WORKSPACE_GROUP: Readonly<Record<string, TaxonomyGroupKey>> = {
  "/": "decisions",
  "/studio": "decisions",
  "/ask": "decisions",
  "/changes": "decisions",
  "/keywords": "decisions",
  "/competitors": "decisions",
  "/recommendations": "decisions",
  "/roadmap": "decisions",
  "/notes": "decisions",

  "/command-center": "evidence",
  // The category front door, not an evidence workspace. Its workspace is
  // /search/tools, which stays under evidence below.
  "/search": "decisions",
  "/search/tools": "evidence",
  "/measurement": "evidence",
  "/ads": "evidence",
  "/authority": "evidence",
  "/essentials": "evidence",
  "/assets": "evidence",
  "/knowledge": "evidence",

  "/workflows": "run_work",
  "/scheduler": "run_work",
  "/seo-runs": "run_work",
  "/openseo": "run_work",
  "/openai-ads": "run_work",
  "/agents": "run_work",

  "/capabilities": "system_health",
  "/spend": "system_health",
  "/operators": "system_health",
};

/** Resolve the group for a pathname using the longest matching route prefix. */
export function taxonomyGroupForPath(pathname: string): TaxonomyGroup | null {
  if (pathname === "/") return TAXONOMY_GROUP_BY_KEY["decisions"];
  const match = Object.keys(WORKSPACE_GROUP)
    .filter((route) => route !== "/" && pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];
  return match ? TAXONOMY_GROUP_BY_KEY[WORKSPACE_GROUP[match]!] : null;
}
