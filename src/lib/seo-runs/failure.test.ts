import { describe, expect, it } from "vitest";

import { describeSeoRunFailure } from "./failure";

describe("SEO run failure reporting", () => {
  it("keeps actionable connector and evidence failures without leaking raw responses", () => {
    expect(describeSeoRunFailure(new Error("GEMINI_API_KEY is not configured"))).toBe(
      "Required connector credentials are not configured.",
    );
    expect(describeSeoRunFailure(new Error("Missing exact-page GSC evidence"))).toBe(
      "Required page evidence is incomplete.",
    );
    expect(describeSeoRunFailure(new Error("upstream said api_key=super-secret"))).toBe(
      "SEO run evaluation failed. Review connector health and try again.",
    );
  });
});
