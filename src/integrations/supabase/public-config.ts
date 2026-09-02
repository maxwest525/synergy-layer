/**
 * The two public Supabase values, readable on any host.
 *
 * `.env` is committed and holds only public configuration, but a host that is
 * not Lovable (Vercel, Netlify, a bare Node box) does not feed that file into
 * the server's runtime `process.env` - only dashboard-configured variables
 * arrive there. The `VITE_`-prefixed copies are inlined into the build by
 * Vite, so falling back to them makes a checkout deploy with zero dashboard
 * configuration.
 *
 * Public values only. Secrets (the service-role key, provider keys) must keep
 * reading `process.env` alone: a secret has no committed copy to fall back to,
 * and must never gain one.
 */

export function supabasePublicUrl(): string | undefined {
  return process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"] || undefined;
}

export function supabasePublishableKey(): string | undefined {
  return (
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    undefined
  );
}
