import { describe, expect, it } from "vitest";

import { definition } from "./self-hosted-analytics";

describe("self-hosted analytics registry", () => {
  it("declares cap.umami real now that an authenticated read has stored snapshots", () => {
    const umami = definition.capabilities?.find((capability) => capability.key === "cap.umami");
    if (!umami) throw new Error("cap.umami must be declared.");

    // The declaration's own promotion condition — "pending until one
    // authenticated read stores a snapshot" — was met on 2026-08-18, when the
    // first authenticated 28-day read stored four immutable umami_snapshots
    // rows. Anything other than "real" is refused by the workflow guard and
    // fails the scheduled umami-daily-observe run every day.
    expect(umami.integrationState).toBe("real");
  });
});
