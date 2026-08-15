export const SERPAPI_PROVIDER_GATE = "cap.serpapi_ads_transparency";

/**
 * The free account check is the only pending capability allowed through the
 * generic workflow guard. Every metered or downstream stage must separately
 * earn a real registry state before the runner can reach it.
 */
export function mayExecuteCapability(ref: string, integrationState: string): boolean {
  return integrationState === "real" || ref === SERPAPI_PROVIDER_GATE;
}
