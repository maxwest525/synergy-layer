import { describe, expect, it } from "vitest";

import { describeHostReadiness, hostReadinessSentence } from "./host-readiness";

describe("host readiness", () => {
  it("names the absent credential instead of letting every action fail generically", () => {
    // The Vercel origin had no service-role key, so every operator action
    // there died with a generic 500 and nothing on screen said why (CODE-46).
    const readiness = describeHostReadiness({ SUPABASE_URL: "https://x.supabase.co" });
    expect(readiness).toEqual({ canOperate: false, missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
    expect(hostReadinessSentence(readiness)).toContain(
      "SUPABASE_SERVICE_ROLE_KEY is absent from its environment",
    );
  });

  it("says nothing on a host that can operate, and never reads a value", () => {
    const readiness = describeHostReadiness({
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "secret-value",
    });
    expect(readiness).toEqual({ canOperate: true, missing: [] });
    expect(hostReadinessSentence(readiness)).toBeNull();
    expect(JSON.stringify(readiness)).not.toContain("secret-value");
  });
});
