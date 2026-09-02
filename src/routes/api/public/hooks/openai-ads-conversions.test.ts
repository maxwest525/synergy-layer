import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveBridgeSecret = vi.fn();
const deliverConversions = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/openai-ads/bridge-secret.server", () => ({
  resolveBridgeSecret: (...args: unknown[]) => resolveBridgeSecret(...args),
}));
vi.mock("@/lib/openai-ads/capi.server", () => ({
  deliverConversions: (...args: unknown[]) => deliverConversions(...args),
}));

import { Route } from "./openai-ads-conversions";

type Handler = (context: { request: Request }) => Promise<Response>;

function post(body: string, secret: string | null): Promise<Response> {
  const handler = (Route.options as unknown as { server?: { handlers?: { POST?: Handler } } })
    .server?.handlers?.POST;
  if (!handler) throw new Error("The hook declares no POST handler.");
  return handler({
    request: new Request("https://aoos.test/api/public/hooks/openai-ads-conversions", {
      method: "POST",
      headers: secret ? { "x-aoos-bridge-secret": secret } : {},
      body,
    }),
  });
}

const batch = JSON.stringify({ tenant_slug: "trumove", conversions: [{ event: "lead" }] });

beforeEach(() => {
  vi.clearAllMocks();
  resolveBridgeSecret.mockResolvedValue({ state: "ok", secret: "bridge-secret" });
  deliverConversions.mockResolvedValue({
    ok: true,
    validateOnly: false,
    summary: { sent: 1 },
    results: [{ event: "lead", status: "sent" }],
  });
});

describe("the OpenAI Ads conversions bridge", () => {
  it("rejects a body that is not JSON or names no tenant before resolving any secret", async () => {
    expect((await post("not json", "bridge-secret")).status).toBe(400);
    expect((await post(JSON.stringify({ conversions: [] }), "bridge-secret")).status).toBe(400);
    expect(resolveBridgeSecret).not.toHaveBeenCalled();
  });

  it("gives an unknown tenant and a wrong secret the same answer, and sends nothing", async () => {
    resolveBridgeSecret.mockResolvedValueOnce({ state: "unknown_tenant" });
    expect((await post(batch, "bridge-secret")).status).toBe(401);
    expect((await post(batch, "wrong")).status).toBe(401);
    expect(deliverConversions).not.toHaveBeenCalled();
  });

  it("also accepts the older variable name the conversions route once read", async () => {
    await post(batch, "bridge-secret");
    expect(resolveBridgeSecret).toHaveBeenCalledWith(expect.anything(), "trumove", {
      alsoTry: ["OPENAI_ADS_CAPI_BRIDGE_SECRET"],
    });
  });

  it("treats an empty batch as a health check that sends nothing to the provider", async () => {
    const response = await post(
      JSON.stringify({ tenant_slug: "trumove", conversions: [] }),
      "bridge-secret",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, healthCheck: true, results: [] });
    expect(deliverConversions).not.toHaveBeenCalled();
  });

  it("delivers a verified batch and returns the provider's outcome", async () => {
    const response = await post(batch, "bridge-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      validateOnly: false,
      summary: { sent: 1 },
    });
    deliverConversions.mockResolvedValueOnce({ ok: false, status: 502, error: "Provider refused" });
    const refused = await post(batch, "bridge-secret");
    expect(refused.status).toBe(502);
    expect(await refused.json()).toEqual({ ok: false, error: "Provider refused" });
  });
});
