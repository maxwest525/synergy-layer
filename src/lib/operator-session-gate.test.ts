import { describe, expect, it, vi } from "vitest";

import {
  getInitialOperatorSession,
  getWorkspaceAccessState,
  readStoredOperatorEmail,
} from "./operator-session-gate";

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

  it("reads persisted display identity without invoking the auth client", () => {
    const key = "sb-test-auth-token";
    const store = new Map([[key, JSON.stringify({ user: { email: "operator@example.com" } })]]);
    vi.stubGlobal("window", {
      localStorage: {
        length: store.size,
        key: (index: number) => [...store.keys()][index] ?? null,
        getItem: (itemKey: string) => store.get(itemKey) ?? null,
      },
    });

    expect(readStoredOperatorEmail()).toBe("operator@example.com");
    vi.unstubAllGlobals();
  });

  it("fails closed when persisted session metadata is malformed", () => {
    const key = "sb-test-auth-token";
    const store = new Map([[key, "not-json"]]);
    vi.stubGlobal("window", {
      localStorage: {
        length: store.size,
        key: () => key,
        getItem: (itemKey: string) => store.get(itemKey) ?? null,
      },
    });

    expect(readStoredOperatorEmail()).toBeNull();
    vi.unstubAllGlobals();
  });
});
