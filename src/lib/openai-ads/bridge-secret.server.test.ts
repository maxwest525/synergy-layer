import { describe, expect, it } from "vitest";

import { resolveBridgeSecret } from "./bridge-secret.server";

function admin(input: { tenants: Record<string, string>; connections: Record<string, string> }) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, value: string) {
              return {
                async maybeSingle() {
                  if (table === "tenants") {
                    const id = input.tenants[value];
                    return { data: id ? { id } : null, error: null };
                  }
                  const name = input.connections[value];
                  return { data: name ? { bridge_secret_name: name } : null, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof resolveBridgeSecret>[0];
}

const two = admin({
  tenants: { trumove: "t-1", other: "t-2" },
  connections: { "t-1": "OPENAI_ADS_BRIDGE_SECRET", "t-2": "OTHER_BRIDGE_SECRET" },
});

describe("the bridge secret is the one the caller's connection names", () => {
  it("resolves each tenant to its own variable", async () => {
    const env = { OPENAI_ADS_BRIDGE_SECRET: "s-1", OTHER_BRIDGE_SECRET: "s-2" };
    await expect(resolveBridgeSecret(two, "trumove", { env })).resolves.toEqual({
      state: "ok",
      tenantId: "t-1",
      secret: "s-1",
      secretName: "OPENAI_ADS_BRIDGE_SECRET",
    });
    await expect(resolveBridgeSecret(two, "other", { env })).resolves.toEqual({
      state: "ok",
      tenantId: "t-2",
      secret: "s-2",
      secretName: "OTHER_BRIDGE_SECRET",
    });
  });

  it("treats an unknown slug and a tenant with no connection the same way", async () => {
    const env = { OPENAI_ADS_BRIDGE_SECRET: "s-1" };
    await expect(resolveBridgeSecret(two, "nobody", { env })).resolves.toEqual({
      state: "unknown_tenant",
    });
    const noConnection = admin({ tenants: { lonely: "t-9" }, connections: {} });
    await expect(resolveBridgeSecret(noConnection, "lonely", { env })).resolves.toEqual({
      state: "unknown_tenant",
    });
  });

  it("says which variable is missing when the host does not carry it", async () => {
    await expect(resolveBridgeSecret(two, "other", { env: {} })).resolves.toEqual({
      state: "unconfigured",
      secretName: "OTHER_BRIDGE_SECRET",
    });
    // Whitespace is not a secret.
    await expect(
      resolveBridgeSecret(two, "trumove", { env: { OPENAI_ADS_BRIDGE_SECRET: "  " } }),
    ).resolves.toEqual({ state: "unconfigured", secretName: "OPENAI_ADS_BRIDGE_SECRET" });
  });

  it("tries the named variable first and the compatibility names after it", async () => {
    await expect(
      resolveBridgeSecret(two, "trumove", {
        env: { OPENAI_ADS_CAPI_BRIDGE_SECRET: "legacy" },
        alsoTry: ["OPENAI_ADS_CAPI_BRIDGE_SECRET"],
      }),
    ).resolves.toEqual({
      state: "ok",
      tenantId: "t-1",
      secret: "legacy",
      secretName: "OPENAI_ADS_CAPI_BRIDGE_SECRET",
    });
    await expect(
      resolveBridgeSecret(two, "trumove", {
        env: { OPENAI_ADS_BRIDGE_SECRET: "named", OPENAI_ADS_CAPI_BRIDGE_SECRET: "legacy" },
        alsoTry: ["OPENAI_ADS_CAPI_BRIDGE_SECRET"],
      }),
    ).resolves.toMatchObject({ secret: "named" });
  });
});
