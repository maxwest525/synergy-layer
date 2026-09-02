/**
 * The bridge secret a caller must present is the one the caller's own
 * connection names, not one global value for every tenant. The row names the
 * environment variable (the same way `secret_name` names the provider
 * credential); the value never leaves the server (BACKLOG CODE-37).
 */

type ConnectionRead = {
  from(table: "tenants"): {
    select(columns: "id"): {
      eq(
        column: "slug",
        value: string,
      ): { maybeSingle(): Promise<{ data: { id: string } | null; error: unknown }> };
    };
  };
  from(table: "openai_ads_connections"): {
    select(columns: "bridge_secret_name"): {
      eq(
        column: "tenant_id",
        value: string,
      ): {
        maybeSingle(): Promise<{
          data: { bridge_secret_name: string } | null;
          error: unknown;
        }>;
      };
    };
  };
};

export type BridgeSecretResolution =
  | { state: "ok"; tenantId: string; secret: string; secretName: string }
  /** No tenant with that slug, or a tenant with no bridge connection. */
  | { state: "unknown_tenant" }
  /** The connection names a variable the host does not carry. */
  | { state: "unconfigured"; secretName: string };

export async function resolveBridgeSecret(
  admin: ConnectionRead,
  tenantSlug: string,
  options: { alsoTry?: string[]; env?: Record<string, string | undefined> } = {},
): Promise<BridgeSecretResolution> {
  const env = options.env ?? process.env;
  const tenant = await admin.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
  if (tenant.error || !tenant.data) return { state: "unknown_tenant" };

  const connection = await admin
    .from("openai_ads_connections")
    .select("bridge_secret_name")
    .eq("tenant_id", tenant.data.id)
    .maybeSingle();
  if (connection.error || !connection.data) return { state: "unknown_tenant" };

  const secretName = connection.data.bridge_secret_name;
  for (const name of [secretName, ...(options.alsoTry ?? [])]) {
    const value = env[name]?.trim();
    if (value) return { state: "ok", tenantId: tenant.data.id, secret: value, secretName: name };
  }
  return { state: "unconfigured", secretName };
}
