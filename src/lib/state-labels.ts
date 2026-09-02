import type { Database } from "@/integrations/supabase/types";

/**
 * The words an operator reads for a stored state. Every database enum has an
 * exhaustive map here, checked at compile time against the generated types
 * and at test time against the runtime constants, so a new enum value cannot
 * reach a screen as `snake_case` (COPY-1). Text-typed states the screens
 * already render are listed too. Anything not listed falls back to the value
 * with its underscores replaced, first letter up, which is what every pill
 * used to show.
 */
type Enums = Database["public"]["Enums"];

export const RUN_STATE_LABELS: Record<Enums["run_state"], string> = {
  queued: "Queued",
  running: "Running",
  awaiting_approval: "Waiting for your approval",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const HEALTH_STATE_LABELS: Record<Enums["health_state"], string> = {
  unknown: "Not checked",
  healthy: "Healthy",
  degraded: "Degraded",
  failing: "Failing",
};

export const ENTITY_STATUS_LABELS: Record<Enums["entity_status"], string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  error: "In error",
};

export const INBOX_LANE_LABELS: Record<Enums["inbox_lane"], string> = {
  needs_attention: "Needs your attention",
  pending_approval: "Waiting for your approval",
  scheduled: "Scheduled",
  completed: "Done",
  fyi: "For your information",
};

export const IMPACT_LEVEL_LABELS: Record<Enums["impact_level"], string> = {
  none: "No impact",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const RECOMMENDATION_STATE_LABELS: Record<Enums["recommendation_state"], string> = {
  draft: "Draft",
  proposed: "Proposed",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  scheduled: "Scheduled",
  applied: "Applied",
  verified: "Verified",
  failed: "Failed",
  rolled_back: "Rolled back",
  observed: "Observed",
};

export const DEPENDENCY_CONDITION_LABELS: Record<Enums["dependency_condition"], string> = {
  on_success: "After the upstream step succeeds",
  on_complete: "After the upstream step finishes",
};

export const MEMORY_SCOPE_LABELS: Record<Enums["memory_scope"], string> = {
  none: "No memory",
  task: "Per task",
  asset: "Per asset",
  global: "Shared",
};

export const ROADMAP_PRIORITY_LABELS: Record<Enums["roadmap_priority"], string> = {
  now: "Now",
  next: "Next",
  later: "Later",
};

export const ROADMAP_STATUS_LABELS: Record<Enums["roadmap_status"], string> = {
  requested: "Requested",
  in_progress: "In progress",
  shipped: "Shipped",
  parked: "Parked",
};

export const APP_ROLE_LABELS: Record<Enums["app_role"], string> = {
  admin: "Administrator",
  operator: "Operator",
  viewer: "Viewer",
};

export const CAPABILITY_KIND_LABELS: Record<Enums["capability_kind"], string> = {
  mcp: "MCP server",
  api: "API",
  connector: "Connector",
  skill: "Skill",
  repository: "Repository",
  model: "Model",
  internal_module: "Internal module",
  service: "Service",
};

export const ASSET_KIND_LABELS: Record<Enums["asset_kind"], string> = {
  website: "Website",
  landing_page: "Landing page",
  research_dataset: "Research dataset",
  blog: "Blog",
  google_ads_account: "Google Ads account",
  google_business_profile: "Google Business Profile",
  github_repository: "GitHub repository",
  supabase_project: "Supabase project",
  domain: "Domain",
  workflow: "Workflow",
  knowledge_collection: "Knowledge collection",
  prompt: "Prompt",
  email_campaign: "Email campaign",
  social_account: "Social account",
};

export const KNOWLEDGE_KIND_LABELS: Record<Enums["knowledge_kind"], string> = {
  documents: "Documents",
  repositories: "Repositories",
  skills: "Skills",
  prompts: "Prompts",
  playbooks: "Playbooks",
  research: "Research",
  design_systems: "Design systems",
  best_practices: "Best practices",
  agent_knowledge: "Agent knowledge",
  memory: "Memory",
  vector_collection: "Vector collection",
};

/** Text-typed states the screens render: integration, connection and review states. */
export const TEXT_STATE_LABELS: Record<string, string> = {
  real: "Real",
  pending: "Pending",
  simulated: "Simulated",
  never_checked: "Never checked",
  not_configured: "Not configured",
  configured: "Configured",
  collecting: "Collecting",
  reaching_you: "Reaching you",
  discovered: "Discovered",
  competitor: "Ranks alongside you",
  surface: "Web platform",
};

const ALL_LABELS: readonly Record<string, string>[] = [
  RUN_STATE_LABELS,
  HEALTH_STATE_LABELS,
  ENTITY_STATUS_LABELS,
  INBOX_LANE_LABELS,
  IMPACT_LEVEL_LABELS,
  RECOMMENDATION_STATE_LABELS,
  DEPENDENCY_CONDITION_LABELS,
  MEMORY_SCOPE_LABELS,
  ROADMAP_PRIORITY_LABELS,
  ROADMAP_STATUS_LABELS,
  APP_ROLE_LABELS,
  CAPABILITY_KIND_LABELS,
  ASSET_KIND_LABELS,
  KNOWLEDGE_KIND_LABELS,
  TEXT_STATE_LABELS,
];

/** The value with its underscores replaced and its first letter up: what every pill used to show. */
export function wordsFor(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.length === 0 ? spaced : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The label for a stored state. A value in more than one map reads the same
 * everywhere (they agree by construction: "failed", "scheduled", "draft"); a
 * value in none falls back to `wordsFor`, so a caller's own phrase passes
 * through with only its underscores gone.
 */
export function stateLabel(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  for (const map of ALL_LABELS) {
    if (Object.prototype.hasOwnProperty.call(map, value)) return map[value]!;
  }
  return wordsFor(value);
}
