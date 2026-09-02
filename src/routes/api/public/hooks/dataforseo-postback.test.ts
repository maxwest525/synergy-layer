import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPostbackToken } from "@/lib/dataforseo/postback-token";

const lookup = vi.fn();
const ingestSerpPostback = vi.fn();
const seenHashes: string[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_column: string, hash: string) => {
          seenHashes.push(hash);
          return { maybeSingle: () => lookup() };
        },
      }),
    }),
  },
}));
vi.mock("@/lib/dataforseo/serp.server", () => ({
  ingestSerpPostback: (...args: unknown[]) => ingestSerpPostback(...args),
}));

import { Route } from "./dataforseo-postback";

type Handler = (context: { request: Request }) => Promise<Response>;

function post(token: string | null, body: unknown): Promise<Response> {
  const handler = (Route.options as unknown as { server?: { handlers?: { POST?: Handler } } })
    .server?.handlers?.POST;
  if (!handler) throw new Error("The hook declares no POST handler.");
  const url = new URL("https://aoos.test/api/public/hooks/dataforseo-postback");
  if (token) url.searchParams.set("token", token);
  return handler({
    request: new Request(url, { method: "POST", body: JSON.stringify(body) }),
  });
}

const queued = { tenant_id: "tenant-1", provider_task_id: "task-9", tag: "fp-9" };
const matching = { tasks: [{ id: "task-9", data: { tag: "fp-9" }, result: [] }] };

beforeEach(() => {
  vi.clearAllMocks();
  seenHashes.length = 0;
  lookup.mockResolvedValue({ data: queued, error: null });
  ingestSerpPostback.mockResolvedValue({ stored: 1 });
});

describe("the DataForSEO postback receiver", () => {
  it("refuses a callback with no token before touching the database", async () => {
    expect((await post(null, matching)).status).toBe(401);
    expect(seenHashes).toEqual([]);
    expect(ingestSerpPostback).not.toHaveBeenCalled();
  });

  it("looks the token up by its hash only, and refuses one no task carries", async () => {
    lookup.mockResolvedValueOnce({ data: null, error: null });
    expect((await post("minted-token", matching)).status).toBe(401);
    expect(seenHashes).toEqual([hashPostbackToken("minted-token")]);
    expect(seenHashes[0]).not.toContain("minted-token");
    expect(ingestSerpPostback).not.toHaveBeenCalled();
  });

  it("refuses a body about a different task than the token's, with the same answer", async () => {
    const other = { tasks: [{ id: "task-1", data: { tag: "fp-1" }, result: [] }] };
    expect((await post("minted-token", other)).status).toBe(401);
    expect(ingestSerpPostback).not.toHaveBeenCalled();
  });

  it("stores a callback about the token's own task for that task's tenant", async () => {
    const response = await post("minted-token", matching);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, stored: 1 });
    expect(ingestSerpPostback).toHaveBeenCalledWith(expect.anything(), "tenant-1", matching);
  });

  it("answers a failed ingest with a bare failure, never the reason", async () => {
    ingestSerpPostback.mockRejectedValueOnce(new Error("dataforseo_snapshots insert failed"));
    const response = await post("minted-token", matching);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe(JSON.stringify({ ok: false }));
  });
});
