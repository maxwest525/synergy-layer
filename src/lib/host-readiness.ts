/**
 * Whether the host serving this page can operate at all.
 *
 * Every operator action runs through the service-role client, which throws at
 * first use when `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is absent. On a
 * host without them (the Vercel origin, CODE-46) every such action failed with
 * a generic 500 and nothing on screen said why. This reads only whether the
 * two names are present, never their values, and says so in one sentence.
 */

/** The names the service-role client refuses to start without (client.server.ts). */
export const HOST_REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export type HostReadiness = {
  /** True when every name the service-role client needs is present. */
  readonly canOperate: boolean;
  /** The names that are absent; never their values. */
  readonly missing: readonly string[];
};

export function describeHostReadiness(env: Record<string, string | undefined>): HostReadiness {
  const missing = HOST_REQUIRED_ENV.filter((name) => !env[name]?.trim());
  return { canOperate: missing.length === 0, missing };
}

/** The banner sentence, or null when the host can operate. */
export function hostReadinessSentence(readiness: HostReadiness): string | null {
  if (readiness.canOperate) return null;
  const names = readiness.missing.join(" and ");
  const verb = readiness.missing.length === 1 ? "is" : "are";
  return `This host is not configured to operate: ${names} ${verb} absent from its environment, so every operator action here fails and only stored reads work. The production host is trumove.marky.systems.`;
}
