import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";

vi.mock("./search-console.server", () => ({
  SearchConsoleFailure: class extends Error {},
  inspectUrl: vi.fn(async () => ({ id: "row" })),
}));

vi.mock("./os.server", () => ({
  logActivity: vi.fn(async () => undefined),
}));

import { inspectUrl } from "./search-console.server";
import { SWEEP_LIMITS, sweepUrlInspections } from "./search-console-sweep.server";

function sweepClient(options: {
  metaUrls: string[];
  inspections: Array<{ inspected_url: string; inspected_at: string }>;
}) {
  const client = {
    from(table: string) {
      const rows =
        table === "page_metadata_observations"
          ? options.metaUrls.map((url) => ({ url, observed_at: "2026-08-18T00:00:00Z" }))
          : options.inspections;
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: rows, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
  return client;
}

describe("sweepUrlInspections", () => {
  beforeEach(() => {
    vi.mocked(inspectUrl).mockClear();
  });

  it("inspects never-inspected pages first and respects the per-run cap", async () => {
    const urls = Array.from({ length: 30 }, (_, i) => `https://site.com/p${i}`);
    const client = sweepClient({ metaUrls: urls, inspections: [] });

    const result = await sweepUrlInspections(client, "sc-domain:site.com");

    expect(result.inspected).toBe(SWEEP_LIMITS.perRun);
    expect(vi.mocked(inspectUrl)).toHaveBeenCalledTimes(SWEEP_LIMITS.perRun);
  });

  it("skips pages inspected within the refresh window", async () => {
    const recent = new Date().toISOString();
    const client = sweepClient({
      metaUrls: ["https://site.com/fresh", "https://site.com/due"],
      inspections: [{ inspected_url: "https://site.com/fresh", inspected_at: recent }],
    });

    const result = await sweepUrlInspections(client, "sc-domain:site.com");

    expect(result.inspected).toBe(1);
    expect(result.skippedFresh).toBe(1);
    expect(vi.mocked(inspectUrl)).toHaveBeenCalledWith(
      client,
      "sc-domain:site.com",
      "https://site.com/due",
      null,
    );
  });

  it("counts failures without sinking the run", async () => {
    vi.mocked(inspectUrl).mockRejectedValueOnce(new Error("out of prefix"));
    const client = sweepClient({
      metaUrls: ["https://site.com/bad", "https://site.com/good"],
      inspections: [],
    });

    const result = await sweepUrlInspections(client, "sc-domain:site.com");

    expect(result.inspected).toBe(1);
    expect(result.failed).toBe(1);
  });

  it("returns a clean zero result with no audited pages", async () => {
    const client = sweepClient({ metaUrls: [], inspections: [] });
    const result = await sweepUrlInspections(client, "sc-domain:site.com");
    expect(result).toEqual({ candidates: 0, inspected: 0, failed: 0, skippedFresh: 0 });
    expect(vi.mocked(inspectUrl)).not.toHaveBeenCalled();
  });
});
