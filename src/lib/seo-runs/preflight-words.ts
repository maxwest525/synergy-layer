import type { SeoPreflight } from "./types";

/**
 * The reason a run stopped at preflight, as one stored sentence. The
 * preflight result was only ever written to the run's event payload, so the
 * run itself read `failure_reason: null` for a blocked state (CODE-44).
 */
export function describePreflightBlock(preflight: SeoPreflight): string | null {
  if (preflight.ready) return null;
  const parts: string[] = [];
  if (preflight.missingConnectors.length > 0) {
    parts.push(`connectors not real: ${preflight.missingConnectors.join(", ")}`);
  }
  if (preflight.unhealthyConnectors.length > 0) {
    parts.push(`connectors unhealthy: ${preflight.unhealthyConnectors.join(", ")}`);
  }
  if (preflight.missingEvidence.length > 0) {
    parts.push(`no stored evidence from: ${preflight.missingEvidence.join(", ")}`);
  }
  if (parts.length === 0) {
    return "Preflight blocked the run without naming a cause; the preflight result is on the run's event.";
  }
  return `Preflight blocked the run: ${parts.join("; ")}.`;
}
