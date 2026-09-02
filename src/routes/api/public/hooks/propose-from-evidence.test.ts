import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const runProposalJob = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock("@/lib/proposals/daily.server", () => ({
  runProposalJob: (...args: unknown[]) => runProposalJob(...args),
}));

import { Route } from "./propose-from-evidence";

type Handler = (context: { request: Request }) => Promise<Response>;

function post(token: string | null): Promise<Response> {
  const handler = (Route.options as unknown as { server?: { handlers?: { POST?: Handler } } })
    .server?.handlers?.POST;
  if (!handler) throw new Error("The hook declares no POST handler.");
  return handler({
    request: new Request("https://aoos.test/api/public/hooks/propose-from-evidence", {
      method: "POST",
      headers: token ? { "x-aoos-scheduler-token": token } : {},
      body: "{}",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
  runProposalJob.mockResolvedValue({ tenants: 1, created: 2 });
});

describe("the nightly propose-from-evidence hook", () => {
  it("refuses a firing with no token, and one the database does not verify, without running the job", async () => {
    expect((await post(null)).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await post("wrong")).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect((await post("right")).status).toBe(401);
    expect(runProposalJob).not.toHaveBeenCalled();
  });

  it("runs the job as the service client once the token verifies", async () => {
    const response = await post("right");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, tenants: 1, created: 2 });
    expect(rpc).toHaveBeenCalledWith("verify_scheduler_hook_token", { _token: "right" });
    expect(runProposalJob).toHaveBeenCalledTimes(1);
  });

  it("answers a thrown job with a bare failure, never the reason", async () => {
    runProposalJob.mockRejectedValueOnce(new Error("SUPABASE_SERVICE_ROLE_KEY is not set"));
    const response = await post("right");
    expect(response.status).toBe(500);
    expect(await response.text()).toBe(JSON.stringify({ ok: false }));
  });
});
