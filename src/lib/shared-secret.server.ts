import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compares a presented shared secret with the expected one without leaking
 * timing. Both sides are hashed first so the comparison runs over equal-length
 * buffers whatever the inputs are; a missing or empty expected secret never
 * matches anything, so an unconfigured hook fails closed.
 *
 * Every public hook that authenticates with a static secret goes through this
 * one function (SEC-9 in the 2026-09-02 security review): a plain `!==` on
 * secret strings was the pattern before, correct in outcome and free to fix.
 */
export function verifySharedSecret(
  presented: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (typeof presented !== "string" || typeof expected !== "string") return false;
  if (presented.length === 0 || expected.length === 0) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
