import type { Tone } from "@/components/os/primitives";


export type EstateFilter = "all" | "discovered" | "installed" | "credentialed" | "live" | "callable";

export const KIND_LABELS: Record<string, string> = {
  local_app: "Local application",
  mcp: "MCP server",
  api: "Provider API",
  connector: "Connector",
  repository: "Local repository",
  adapter: "Local adapter",
  vault: "Credential vault",
};

export const MODE_LABELS: Record<string, string> = {
  read: "Read",
  draft: "Draft",
  write: "Write",
  admin: "Admin",
  internal: "Helper",
};

export const COST_LABELS: Record<string, string> = {
  free: "No provider cost",
  metered: "Metered",
  unknown: "Cost unknown",
  provider_quota: "Provider quota",
};

export const INSTALLED_LABELS: Record<string, string> = {
  unknown: "Install state unknown",
  discovered: "Discovered, install not confirmed",
  installed: "Installed",
  not_installed: "Not installed locally",
};

export const CREDENTIAL_LABELS: Record<string, string> = {
  unknown: "Credential state unknown",
  none: "No configuration observed",
  configured: "Configured (metadata observed, no values stored)",
  encrypted_not_enumerated: "Encrypted, not enumerated safely",
};

export const VERIFICATION_LABELS: Record<string, string> = {
  unverified: "Not proven working in this audit",
  partially_live_proven: "Partly proven working locally",
  live_proven: "Proven working locally",
  surface_counted: "Surface counted, full normalized import queued",
};

type AvailabilityInput = {
  installed_state: string;
  aoos_connection_state: string;
  verification_state: string;
};

export function availabilityLabel(system: AvailabilityInput): string {
  if (system.aoos_connection_state === "callable") return "Callable from AOOS";
  if (system.verification_state === "surface_counted") return "Surface counted · import queued";
  if (system.installed_state === "installed") return "Installed locally · not connected to AOOS";
  return "Discovered · not connected to AOOS";
}

export function availabilityTone(system: AvailabilityInput): Tone {
  if (system.aoos_connection_state === "callable") return "positive";
  if (system.installed_state === "installed") return "warning";
  return "neutral";
}

/** Sentence-case availability text. StatePill title-cases its label, which reads wrong for a full sentence. */
export const AVAILABILITY_TONE_CLASS: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  positive: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  primary: "text-primary",
};
