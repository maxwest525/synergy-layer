import { describe, expect, it, vi } from "vitest";

import { probeN8n, triggerN8nWorkflow } from "./n8n.server";

describe("n8n bridge", () => {
  it("health-checks without triggering the workflow", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok", { status: 200 }));

    const result = await probeN8n({ env: { N8N_WEBHOOK_SECRET: "secret" }, fetcher });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://n8n.marky.systems/healthz");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(result.health).toBe("healthy");
  });

  it("triggers only the configured webhook with auth and idempotency", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ accepted: true, provider: "crawl4ai", evidence: {} }));

    const result = await triggerN8nWorkflow(
      {
        runId: "run-1",
        targetUrl: "https://trumoveinc.com/services/long-distance-moving",
        idempotencyKey: "request-1",
      },
      { env: { N8N_WEBHOOK_SECRET: "secret" }, fetcher },
    );

    expect(fetcher.mock.calls[0]?.[0]).toBe("https://n8n.marky.systems/webhook/aoos-governed-seo");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer secret",
        "Idempotency-Key": "request-1",
      }),
    });
    expect(result).toEqual({ accepted: true, provider: "crawl4ai", evidence: {} });
  });

  it("refuses missing auth before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      triggerN8nWorkflow(
        { runId: "run-1", targetUrl: "https://trumoveinc.com/", idempotencyKey: "once" },
        { env: {}, fetcher },
      ),
    ).rejects.toThrow("N8N_WEBHOOK_SECRET is required");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redacts unreadable responses and reports timeouts safely", async () => {
    const unreadable = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret upstream body", { status: 200 }));
    const input = {
      runId: "run-1",
      targetUrl: "https://trumoveinc.com/",
      idempotencyKey: "once",
    };

    await expect(
      triggerN8nWorkflow(input, { env: { N8N_WEBHOOK_SECRET: "secret" }, fetcher: unreadable }),
    ).rejects.toThrow("n8n returned unreadable JSON");

    const timeout = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("secret timeout detail", "AbortError")),
          );
        }),
    );
    await expect(
      triggerN8nWorkflow(input, {
        env: { N8N_WEBHOOK_SECRET: "secret" },
        fetcher: timeout,
        timeoutMs: 1,
      }),
    ).rejects.toThrow("n8n workflow request timed out");
  });
});
