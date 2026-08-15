import { describe, expect, it, vi } from "vitest";

import { getWorkspaceAccessState, resolveOperatorEmail } from "./operator-session-gate";

describe("operator workspace session gate", () => {
  it.each([
    [{ ready: false, signedIn: false, onAuthRoute: false }, "loading"],
    [{ ready: true, signedIn: false, onAuthRoute: false }, "signed-out"],
    [{ ready: true, signedIn: true, onAuthRoute: false }, "ready"],
    [{ ready: false, signedIn: false, onAuthRoute: true }, "ready"],
  ] as const)("returns %s as %s", (input, expected) => {
    expect(getWorkspaceAccessState(input)).toBe(expected);
  });
});

describe("operator session resolution", () => {
  it("fails closed when the auth client never resolves", async () => {
    vi.useFakeTimers();
    const result = resolveOperatorEmail(() => new Promise<string | null>(() => undefined), 100);

    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toBeNull();
    vi.useRealTimers();
  });
});
