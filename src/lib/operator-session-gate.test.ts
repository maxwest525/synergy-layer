import { describe, expect, it, vi } from "vitest";

import { getInitialOperatorSession, getWorkspaceAccessState } from "./operator-session-gate";

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
  it("server-renders a safe signed-out state instead of an endless loader", () => {
    expect(getInitialOperatorSession()).toEqual({
      ready: true,
      email: null,
      signedIn: false,
    });
  });

  it("waits for the auth client when the browser already holds a token", () => {
    const store = new Map([["sb-test-auth-token", "{}"]]);
    vi.stubGlobal("window", {
      localStorage: {
        length: store.size,
        key: (index: number) => [...store.keys()][index] ?? null,
      },
    });
    expect(getInitialOperatorSession()).toEqual({
      ready: false,
      email: null,
      signedIn: false,
    });
    vi.unstubAllGlobals();
  });
});
