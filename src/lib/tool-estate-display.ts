import type { Tone } from "@/components/os/primitives";

export type EstateFilter =
  | "all"
  | "available"
  | "enabled"
  | "credentialed"
  | "implemented"
  | "callable"
  | "installed"
  | "live";

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

/** Alias types. An included service is not a duplicate registration. */
export const ALIAS_KIND_LABELS: Record<string, string> = {
  included_service: "Included service",
  duplicate_registration: "Duplicate registration",
  adapter_alias: "Adapter alias",
  client_alias: "Client alias",
  other: "Other registration",
};

export const ALIAS_KIND_TONE: Record<string, Tone> = {
  included_service: "primary",
  duplicate_registration: "warning",
  adapter_alias: "neutral",
  client_alias: "neutral",
  other: "neutral",
};

/** Readiness facts. Each one is independent; none of them implies another. */
export const AVAILABLE_LABELS: Record<string, string> = {
  unknown: "Not known yet",
  available_to_enable: "Available to enable",
  not_available: "Not available to enable",
};

export const ENABLED_LABELS: Record<string, string> = {
  unknown: "Not known yet",
  not_enabled: "Not enabled",
  enabled: "Enabled",
};

export const IMPLEMENTED_LABELS: Record<string, string> = {
  not_implemented: "Not implemented in AOOS",
  partially_implemented: "Partly implemented in AOOS",
  implemented: "Implemented in AOOS",
};

type AvailabilityInput = {
  kind?: string;
  installed_state: string;
  aoos_connection_state: string;
  verification_state: string;
};

/**
 * Verification wording follows where the proof was actually observed. A vault
 * metadata index being reachable never implies its providers were tested.
 */
export function verificationLabel(system: AvailabilityInput): string {
  const proven =
    system.verification_state === "live_proven" ||
    system.verification_state === "partially_live_proven";
  if (!proven) return VERIFICATION_LABELS[system.verification_state] ?? system.verification_state;

  const partly = system.verification_state === "partially_live_proven";
  if (system.kind === "vault") {
    return partly ? "Metadata index partly verified" : "Metadata index verified";
  }
  if (system.aoos_connection_state === "callable") {
    return partly ? "Partly proven working from AOOS" : "Proven working from AOOS";
  }
  return partly ? "Partly proven working locally" : "Proven working locally";
}

export function availabilityLabel(system: AvailabilityInput): string {
  if (system.aoos_connection_state === "callable") return "Callable from AOOS";
  if (system.kind === "vault") {
    const verified =
      system.verification_state === "live_proven" ||
      system.verification_state === "partially_live_proven";
    return verified
      ? "Metadata verified · not connected to AOOS"
      : "Metadata index · not connected to AOOS";
  }
  if (system.verification_state === "surface_counted") return "Surface counted · import queued";
  if (system.installed_state === "installed") return "Installed locally · not connected to AOOS";
  return "Discovered · not connected to AOOS";
}

export function availabilityTone(system: AvailabilityInput): Tone {
  if (system.aoos_connection_state === "callable") return "positive";
  if (system.kind === "vault") return "neutral";
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

