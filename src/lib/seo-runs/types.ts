import type { ChangeState } from "../change-request-state";

export const SEO_REQUIRED_CONNECTORS = [
  "supabase",
  "google_search_console",
  "dataforseo",
  "firecrawl",
  "gemini_generation",
  "gemini_embeddings",
  "github_executor",
] as const;

export type SeoRunState =
  | "draft"
  | "preflight_blocked"
  | "evidence_ready"
  | "evaluated"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "executed"
  | "verified"
  | "rejected"
  | "failed"
  | "rolled_back";

export type ConnectorProof = {
  capabilityKey: string;
  integrationState: string;
  health: string;
  probeOutcome?: string | null;
};

export type SeoPreflight = {
  ready: boolean;
  missingConnectors: string[];
  unhealthyConnectors: string[];
  missingEvidence: string[];
};

export type ExecutionState = "queued" | "running" | "succeeded" | "failed" | null;
export type SourceExecutionStatus = "committed" | "reconciled" | "replayed" | "refused" | "failed";

export function deriveSeoRunSourceExecutionState(
  status: SourceExecutionStatus,
): "executing" | "failed" {
  return status === "refused" || status === "failed" ? "failed" : "executing";
}

export function deriveSeoRunState(
  changeState: ChangeState | null,
  executionState: ExecutionState = null,
): SeoRunState {
  if (executionState === "running" || executionState === "queued") return "executing";
  if (executionState === "failed") return "failed";
  if (changeState === "approved") return "approved";
  if (changeState === "applied" || executionState === "succeeded") return "executed";
  if (changeState === "verified") return "verified";
  if (changeState === "rejected") return "rejected";
  if (changeState === "rolled_back") return "rolled_back";
  if (changeState === "proposed") return "awaiting_approval";
  return "draft";
}
