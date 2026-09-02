import { beforeEach, describe, expect, it, vi } from "vitest";

const tickScheduler = vi.fn();
const recordScheduleFiring = vi.fn(async (..._args: unknown[]) => undefined);
const rpc = vi.fn();
const scheduleLookup = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => scheduleLookup() }),
      }),
    }),
  },
}));
vi.mock("@/lib/scheduler.server", () => ({
  tickScheduler: (...args: unknown[]) => tickScheduler(...args),
  recordScheduleFiring: (...args: unknown[]) => recordScheduleFiring(...args),
}));

import { Route } from "./scheduler-tick";

type Handler = (context: { request: Request }) => Promise<Response>;

function post(body: unknown, token: string | null): Promise<Response> {
  const handler = (Route.options as unknown as { server?: { handlers?: { POST?: Handler } } })
    .server?.handlers?.POST;
  if (!handler) throw new Error("The hook declares no POST handler.");
  return handler({
    request: new Request("https://aoos.test/api/public/hooks/scheduler-tick", {
      method: "POST",
      headers: token ? { "x-aoos-scheduler-token": token } : {},
      body: JSON.stringify(body),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
  scheduleLookup.mockResolvedValue({ data: { id: "sched-1", tenant_id: "tenant-1" }, error: null });
  tickScheduler.mockResolvedValue({ claimed: 1, blocked: 0, lostToAnotherTick: 0, ran: [] });
});

describe("the pg_cron scheduler hook", () => {
  it("refuses a firing with no token, and one the database does not verify, without ticking", async () => {
    expect((await post({ scheduleKey: "gsc-daily-observe" }, null)).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await post({ scheduleKey: "gsc-daily-observe" }, "wrong")).status).toBe(401);
    expect(tickScheduler).not.toHaveBeenCalled();
  });

  it("refuses a schedule outside the automated allow-list", async () => {
    const response = await post({ scheduleKey: "sch.publish" }, "right");
    expect(response.status).toBe(400);
    expect(tickScheduler).not.toHaveBeenCalled();
  });

  it("ticks exactly the named schedule as pg_cron, never the paid backlog", async () => {
    const response = await post({ scheduleKey: "gsc-daily-observe" }, "right");
    expect(response.status).toBe(200);
    expect(tickScheduler).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      expect.objectContaining({
        onlyKeys: ["gsc-daily-observe"],
        collectSerpBacklog: false,
        firedBy: "pg_cron",
      }),
    );
  });

  it("writes a failed firing down when the tick throws before claiming anything", async () => {
    tickScheduler.mockRejectedValueOnce(new Error("schedules read failed"));
    const response = await post({ scheduleKey: "ga4-daily-observe" }, "right");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false });
    expect(recordScheduleFiring).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scheduleId: "sched-1",
        tenantId: "tenant-1",
        scheduleKey: "ga4-daily-observe",
        firedBy: "pg_cron",
        state: "failed",
        error: "schedules read failed",
      }),
    );
  });
});
