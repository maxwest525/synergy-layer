import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveBridgeSecret = vi.fn();
const ingestOpenAiAdsEvents = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/openai-ads/bridge-secret.server", () => ({
  resolveBridgeSecret: (...args: unknown[]) => resolveBridgeSecret(...args),
}));
vi.mock("@/lib/openai-ads/ingest.server", () => ({
  ingestPayloadSchema: {
    safeParse: (value: unknown) => {
      const record = value as { tenantSlug?: unknown; events?: unknown } | null;
      return record && typeof record.tenantSlug === "string" && Array.isArray(record.events)
        ? { success: true, data: record }
        : { success: false };
    },
  },
  ingestOpenAiAdsEvents: (...args: unknown[]) => ingestOpenAiAdsEvents(...args),
}));

import { Route } from "./openai-ads-events";

type Handler = (context: { request: Request }) => Promise<Response>;

function post(body: string, secret: string | null): Promise<Response> {
  const handler = (Route.options as unknown as { server?: { handlers?: { POST?: Handler } } })
    .server?.handlers?.POST;
  if (!handler) throw new Error("The hook declares no POST handler.");
  return handler({
    request: new Request("https://aoos.test/api/public/hooks/openai-ads-events", {
      method: "POST",
      headers: secret ? { "x-aoos-bridge-secret": secret } : {},
      body,
    }),
  });
}

const batch = JSON.stringify({ tenantSlug: "trumove", events: [{ name: "lead" }] });

beforeEach(() => {
  vi.clearAllMocks();
  resolveBridgeSecret.mockResolvedValue({ state: "ok", secret: "bridge-secret" });
  ingestOpenAiAdsEvents.mockResolvedValue({ ok: true, stored: 1 });
});

describe("the OpenAI Ads events bridge", () => {
  it("rejects a body that is not JSON or not the payload shape before resolving any tenant", async () => {
    expect((await post("not json", "bridge-secret")).status).toBe(400);
    expect((await post(JSON.stringify({ events: [] }), "bridge-secret")).status).toBe(400);
    expect(resolveBridgeSecret).not.toHaveBeenCalled();
  });

  it("gives an unknown tenant and a wrong secret the same answer, and stores nothing", async () => {
    resolveBridgeSecret.mockResolvedValueOnce({ state: "unknown_tenant" });
    expect((await post(batch, "bridge-secret")).status).toBe(401);
    expect((await post(batch, "wrong")).status).toBe(401);
    expect((await post(batch, null)).status).toBe(401);
    expect(ingestOpenAiAdsEvents).not.toHaveBeenCalled();
  });

  it("says the bridge is not configured when the tenant names no secret", async () => {
    resolveBridgeSecret.mockResolvedValueOnce({ state: "unconfigured" });
    expect((await post(batch, "bridge-secret")).status).toBe(503);
    expect(ingestOpenAiAdsEvents).not.toHaveBeenCalled();
  });

  it("treats an empty batch as a health check that stores nothing", async () => {
    const response = await post(
      JSON.stringify({ tenantSlug: "trumove", events: [] }),
      "bridge-secret",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, stored: 0, healthCheck: true });
    expect(ingestOpenAiAdsEvents).not.toHaveBeenCalled();
  });

  it("stores a verified batch as the service client", async () => {
    const response = await post(batch, "bridge-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, accepted: true, stored: 1 });
    expect(resolveBridgeSecret).toHaveBeenCalledWith(expect.anything(), "trumove");
    expect(ingestOpenAiAdsEvents).toHaveBeenCalledTimes(1);
  });
});
