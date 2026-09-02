import { describe, expect, it } from "vitest";

import { verifySharedSecret } from "./shared-secret.server";

describe("a shared secret is compared in constant time and fails closed", () => {
  it("accepts only an exact match", () => {
    expect(verifySharedSecret("abc-123", "abc-123")).toBe(true);
    expect(verifySharedSecret("abc-124", "abc-123")).toBe(false);
    expect(verifySharedSecret("abc-1234", "abc-123")).toBe(false);
    expect(verifySharedSecret("ABC-123", "abc-123")).toBe(false);
  });

  it("never matches when either side is missing or empty", () => {
    expect(verifySharedSecret(null, "abc")).toBe(false);
    expect(verifySharedSecret(undefined, "abc")).toBe(false);
    expect(verifySharedSecret("abc", null)).toBe(false);
    expect(verifySharedSecret("abc", undefined)).toBe(false);
    expect(verifySharedSecret("", "")).toBe(false);
    expect(verifySharedSecret("abc", "")).toBe(false);
  });
});
