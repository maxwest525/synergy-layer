import { describe, expect, it, vi } from "vitest";

import { installVitePreloadRecovery, requestRouterRuntimeRecovery } from "./vite-runtime-recovery";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("Vite runtime recovery", () => {
  it("reloads once when Vite reports an obsolete dynamic chunk", () => {
    const target = new EventTarget();
    const storage = createStorage();
    const reload = vi.fn();
    const dispose = installVitePreloadRecovery({
      target,
      storage,
      reload,
      now: () => 10_000,
    });

    const first = new Event("vite:preloadError", { cancelable: true });
    const repeated = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(first);
    target.dispatchEvent(repeated);
    dispose();

    expect(first.defaultPrevented).toBe(true);
    expect(repeated.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads once when router creation detects a duplicate route tree", () => {
    const storage = createStorage();
    const reload = vi.fn();
    const runtime = { storage, reload, now: () => 20_000 };

    const recovered = requestRouterRuntimeRecovery(
      new Error("Invariant failed: Duplicate routes found with id: /"),
      runtime,
    );
    const suppressed = requestRouterRuntimeRecovery(
      new Error("Invariant failed: Duplicate routes found with id: /"),
      runtime,
    );

    expect(recovered).toBe(true);
    expect(suppressed).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for an ordinary application error", () => {
    const reload = vi.fn();

    const recovered = requestRouterRuntimeRecovery(new Error("Database unavailable"), {
      storage: createStorage(),
      reload,
      now: () => 30_000,
    });

    expect(recovered).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
