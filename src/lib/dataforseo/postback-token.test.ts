import { describe, expect, it } from "vitest";

import { decidePostback, hashPostbackToken, newPostbackToken, postbackUrl } from "./postback-token";

describe("the postback token", () => {
  it("is random per task and never the publishable key", () => {
    const a = newPostbackToken();
    const b = newPostbackToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("is stored as a stable SHA-256 hex digest", () => {
    const token = "fixed-token";
    expect(hashPostbackToken(token)).toBe(hashPostbackToken(token));
    expect(hashPostbackToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPostbackToken(token)).not.toBe(hashPostbackToken("fixed-token2"));
  });

  it("rides in the postback URL in place of the key, beside the provider's placeholders", () => {
    const url = postbackUrl("https://aoos.example", "tok_1");
    expect(url).toBe(
      "https://aoos.example/api/public/hooks/dataforseo-postback?id=$id&tag=$tag&token=tok_1",
    );
    expect(url).not.toMatch(/key=/);
  });
});

describe("deciding a postback", () => {
  const queued = { tenant_id: "t1", provider_task_id: "p-1", tag: "fp-1" };
  const body = { tasks: [{ id: "p-1", data: { tag: "fp-1" } }] };

  it("accepts a token that maps to the task the body is about", () => {
    expect(decidePostback({ token: "tok", queued, body })).toEqual({ ok: true, tenantId: "t1" });
  });

  it("refuses a missing token before touching anything", () => {
    expect(decidePostback({ token: null, queued, body })).toEqual({
      ok: false,
      reason: "no_token",
    });
    expect(decidePostback({ token: "", queued, body })).toEqual({ ok: false, reason: "no_token" });
  });

  it("refuses a token that maps to no queued task", () => {
    expect(decidePostback({ token: "tok", queued: null, body })).toEqual({
      ok: false,
      reason: "unknown_token",
    });
  });

  it("refuses a body about a different task, even with a valid token", () => {
    expect(
      decidePostback({
        token: "tok",
        queued,
        body: { tasks: [{ id: "p-2", data: { tag: "fp-1" } }] },
      }),
    ).toEqual({ ok: false, reason: "task_mismatch" });
    expect(
      decidePostback({
        token: "tok",
        queued,
        body: { tasks: [{ id: "p-1", data: { tag: "other" } }] },
      }),
    ).toEqual({ ok: false, reason: "task_mismatch" });
    expect(decidePostback({ token: "tok", queued, body: { tasks: [] } })).toEqual({
      ok: false,
      reason: "task_mismatch",
    });
    expect(decidePostback({ token: "tok", queued, body: null })).toEqual({
      ok: false,
      reason: "task_mismatch",
    });
  });
});
