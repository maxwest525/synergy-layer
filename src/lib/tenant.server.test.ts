import { describe, expect, it, vi } from "vitest";

/**
 * The service-role client sees every row. Until 2026-09-02 `resolveTenantId`
 * let it fall through the same profile and membership fallbacks a session
 * client uses, so a scheduled run resolved its tenant from whichever
 * account's profile came first, and pinned it for the process lifetime.
 * These pin the rule that replaced that: without a session there is no
 * current operator, only an explicit id or the sole tenant.
 */

type Result = { data: unknown; error: null };

function fakeClient(tables: Record<string, Result>, touched: string[]) {
  const client = {
    from(table: string) {
      touched.push(table);
      const result = tables[table] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "limit", "order"]) {
        chain[method] = () => chain;
      }
      chain["maybeSingle"] = async () => {
        const rows = Array.isArray(result.data) ? result.data : [result.data];
        return { data: rows[0] ?? null, error: null };
      };
      chain["then"] = (resolve: (value: Result) => unknown) =>
        Promise.resolve(result).then(resolve);
      return chain;
    },
  };
  return client;
}

const serviceTouched: string[] = [];
const serviceTables: Record<string, Result> = {};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: fakeClient(serviceTables, serviceTouched),
}));

const { resolveTenantId } = await import("./tenant.server");
const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

describe("the service role never borrows an operator's workspace", () => {
  it("takes the sole tenant while there is exactly one, and reads no profile or membership", async () => {
    serviceTouched.length = 0;
    serviceTables["tenants"] = { data: [{ id: "t-only" }], error: null };
    await expect(resolveTenantId(supabaseAdmin as never)).resolves.toBe("t-only");
    expect(serviceTouched).toEqual(["tenants"]);
  });

  it("answers with nothing once a second tenant exists, rather than the first profile it sees", async () => {
    serviceTouched.length = 0;
    serviceTables["tenants"] = { data: [{ id: "t-1" }, { id: "t-2" }], error: null };
    await expect(resolveTenantId(supabaseAdmin as never)).resolves.toBeNull();
    expect(serviceTouched).not.toContain("profiles");
    expect(serviceTouched).not.toContain("tenant_members");
  });

  it("does not pin the answer: a later call sees the current tenant count", async () => {
    serviceTables["tenants"] = { data: [{ id: "t-1" }, { id: "t-2" }], error: null };
    await expect(resolveTenantId(supabaseAdmin as never)).resolves.toBeNull();
    serviceTables["tenants"] = { data: [{ id: "t-1" }], error: null };
    await expect(resolveTenantId(supabaseAdmin as never)).resolves.toBe("t-1");
  });

  it("honours an explicit tenant the way every client does", async () => {
    serviceTables["tenants"] = { data: [{ id: "t-2" }], error: null };
    await expect(resolveTenantId(supabaseAdmin as never, "t-2")).resolves.toBe("t-2");
  });
});

describe("a session client still resolves the operator's own selection", () => {
  it("reads the saved active workspace and checks it is visible", async () => {
    const touched: string[] = [];
    const client = fakeClient(
      {
        profiles: { data: [{ active_tenant_id: "t-mine" }], error: null },
        tenant_members: { data: [{ tenant_id: "t-mine" }], error: null },
        tenants: { data: [{ id: "t-mine" }], error: null },
      },
      touched,
    );
    await expect(resolveTenantId(client as never)).resolves.toBe("t-mine");
    expect(touched).toContain("profiles");
  });
});
