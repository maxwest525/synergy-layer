import { describe, expect, it } from "vitest";

import {
  buildConnections,
  CONNECTION_OUTPUTS,
  FINDING_SOURCES,
  type ConnectionFacts,
} from "./connections";

/**
 * Only shapes the server function can actually return.
 *
 * `storedRows` and `failedRows` are null exactly when the connection has no
 * table, and `findings` is null exactly when no module reads it. The first
 * version of this file defaulted all three to `0`, which let every test run
 * against a world the server cannot produce - and that is precisely how the
 * mistake in `findingSources` survived a green suite.
 */
function facts(key: string, overrides: Partial<ConnectionFacts> = {}): ConnectionFacts {
  const output = CONNECTION_OUTPUTS.find((entry) => entry.key === key);
  if (!output) throw new Error(`${key} is not a connection`);
  return {
    key,
    configured: true,
    storedRows: output.table === null ? null : 0,
    failedRows: output.succeeded === null ? null : 0,
    findings: output.findingSources.length === 0 ? null : 0,
    ...overrides,
  };
}

/** All ten, as the server always returns them, with a few overridden. */
function everything(overrides: Record<string, Partial<ConnectionFacts>> = {}) {
  return CONNECTION_OUTPUTS.map((output) => facts(output.key, overrides[output.key] ?? {}));
}

function row(view: ReturnType<typeof buildConnections>, key: string) {
  const found = view.rows.find((entry) => entry.key === key);
  if (!found) throw new Error(`no row for ${key}`);
  return found;
}

describe("the stage no screen has ever shown", () => {
  it("separates collecting from reaching you", () => {
    // The whole point. A connector can be configured, wired, and storing rows
    // while nothing turns any of them into something the operator sees.
    const view = buildConnections([
      facts("dataforseo", { storedRows: 412 }),
      facts("google_search_console", { storedRows: 900, findings: 14 }),
    ]);
    expect(row(view, "dataforseo").stage).toBe("collecting");
    expect(row(view, "google_search_console").stage).toBe("reaching_you");
  });

  it("says the reading is happening and the telling is not", () => {
    const view = buildConnections([facts("dataforseo", { storedRows: 412 })]);
    expect(row(view, "dataforseo").reason).toContain("412");
    expect(row(view, "dataforseo").reason).toMatch(/reading is happening; the telling is not/i);
  });

  it("names the silent ones in the headline", () => {
    const view = buildConnections([
      facts("dataforseo", { storedRows: 412 }),
      facts("umami", { storedRows: 30 }),
    ]);
    expect(view.headline).toContain("DataForSEO");
    expect(view.headline).toContain("Umami");
    expect(view.headline).toMatch(/wiring gap, not a fault in the tool/i);
  });

  it("counts the writers rather than asserting how many there are", () => {
    // This sentence said "two" when there were three. It is now derived.
    const view = buildConnections([facts("dataforseo", { storedRows: 412 })]);
    expect(view.headline).toContain("three parts");
    expect(FINDING_SOURCES).toHaveLength(3);
  });

  it("says nothing when no connection is collecting in silence", () => {
    const view = buildConnections([
      facts("google_search_console", { storedRows: 900, findings: 14 }),
    ]);
    expect(view.headline).toBeNull();
  });
});

describe("who is credited with a finding", () => {
  it("credits Google Analytics, which does write findings", () => {
    // Registered as producing none in the first draft, so a working module was
    // told it reached nobody. `connections.registry.test.ts` guards the cause.
    const view = buildConnections([facts("google_analytics_4", { storedRows: 90, findings: 6 })]);
    expect(row(view, "google_analytics_4").stage).toBe("reaching_you");
  });

  it("will not call a connection that stored nothing 'reaching you'", () => {
    // Firecrawl feeds the Search Console checks, so its finding count is
    // non-zero the moment those checks run on anything. With no page reads of
    // its own it has still collected nothing.
    const view = buildConnections([facts("firecrawl", { storedRows: 0, findings: 30 })]);
    expect(row(view, "firecrawl").stage).toBe("configured");
    expect(row(view, "firecrawl").reason).not.toContain("30");
  });

  it("refuses to let either feeder of a shared module claim its findings alone", () => {
    const view = buildConnections([
      facts("firecrawl", { storedRows: 300, findings: 12 }),
      facts("google_search_console", { storedRows: 900, findings: 12 }),
    ]);
    expect(row(view, "firecrawl").reason).toMatch(/alongside Google Search Console/);
    expect(row(view, "firecrawl").reason).not.toMatch(/doing its job/);
    expect(row(view, "google_search_console").reason).toMatch(/alongside Firecrawl/);
  });

  it("gives the self-hosted crawler no table and no findings of another's", () => {
    // It shares neither. The page audit only ever calls the hosted endpoint, so
    // not one row in `page_metadata_observations` can have come from it.
    const output = CONNECTION_OUTPUTS.find((entry) => entry.key === "selfhosted_firecrawl");
    expect(output?.table).toBeNull();
    expect(output?.findingSources).toEqual([]);
    const view = buildConnections([facts("selfhosted_firecrawl")]);
    expect(row(view, "selfhosted_firecrawl").reason).toMatch(/nothing in this system calls it/i);
  });
});

describe("a failed attempt is not collection", () => {
  it("says the calls are failing rather than that the reading is happening", () => {
    // A revoked SerpAPI key writes a row per attempt. Counting those as
    // collection produced "the reading is happening; the telling is not" for a
    // connector whose every call returned 401.
    const view = buildConnections([facts("serpapi", { storedRows: 0, failedRows: 50 })]);
    expect(row(view, "serpapi").stage).toBe("configured");
    expect(row(view, "serpapi").reason).toMatch(/50 attempts failed/);
    expect(row(view, "serpapi").reason).not.toMatch(/reading is happening/);
  });

  it("mentions the failures alongside the successes", () => {
    const view = buildConnections([facts("openseo", { storedRows: 20, failedRows: 3 })]);
    expect(row(view, "openseo").stage).toBe("collecting");
    expect(row(view, "openseo").reason).toMatch(/20 rows stored/);
    expect(row(view, "openseo").reason).toMatch(/3 other attempts failed/);
  });

  it("stays silent about failures when there are none", () => {
    const view = buildConnections([facts("openseo", { storedRows: 20, failedRows: 0 })]);
    expect(row(view, "openseo").reason).not.toMatch(/failed/);
  });
});

describe("the four stages", () => {
  it("calls an unset connection not configured, not broken", () => {
    const view = buildConnections([facts("umami", { configured: false })]);
    expect(row(view, "umami").stage).toBe("not_configured");
    expect(row(view, "umami").reason).toMatch(/credentials are not set/i);
  });

  it("tells a credential with no code behind it apart from an unrun one", () => {
    // Google Ads has a credential slot and nothing reads it. That is a
    // different problem from an account that simply has not run yet.
    const view = buildConnections([facts("google_ads"), facts("pagespeed_insights")]);
    expect(row(view, "google_ads").reason).toMatch(/nothing in this system calls it/i);
    expect(row(view, "pagespeed_insights").reason).toMatch(/nothing has been stored/i);
  });

  it("counts findings as the proof that it reaches you, not stored rows", () => {
    const view = buildConnections([facts("firecrawl", { storedRows: 5000, findings: 0 })]);
    expect(row(view, "firecrawl").stage).toBe("collecting");
  });
});

describe("the pill never reassures over a body that disagrees", () => {
  it("does not clear a whole estate that is not set up", () => {
    // The bug this describe block exists for: with nothing configured there is
    // nothing to complain about, and the first draft went green above ten rows
    // reading "not set up" and four tiles of zero.
    const view = buildConnections([]);
    expect(view.status.tone).not.toBe("positive");
    expect(view.status.text).toMatch(/No account is set up yet/i);
  });

  it("does not clear an estate where one connection works and nine are dark", () => {
    const view = buildConnections([
      facts("google_search_console", { storedRows: 900, findings: 14 }),
    ]);
    expect(view.status.text).toBe("1 of 10 connections reach you");
  });

  it("goes green only with a count beside it, never as a bare all-clear", () => {
    const view = buildConnections([
      facts("google_search_console", { storedRows: 900, findings: 14 }),
      facts("google_analytics_4", { storedRows: 90, findings: 6 }),
    ]);
    expect(view.status.tone).toBe("positive");
    expect(view.status.text).toBe("2 of 10 connections reach you");
  });

  it("has no state that claims the whole estate is wired", () => {
    // Two connectors have no table by design, so any rule requiring all ten to
    // reach you would be a branch that never runs.
    const view = buildConnections(everything());
    expect(view.status.text).not.toMatch(/every connection/i);
  });

  it("keeps the red pill and the red banner agreeing", () => {
    const view = buildConnections([facts("dataforseo", { storedRows: 412 })]);
    expect(view.status.tone).toBe("danger");
    expect(view.headline).not.toBeNull();
  });
});

describe("the ordering puts the costly silence first", () => {
  it("ranks collecting-in-silence above never-set-up", () => {
    // An unset connection costs nothing. One that collects and reaches nobody
    // may be costing money on every run.
    const view = buildConnections([
      facts("umami", { configured: false }),
      facts("dataforseo", { storedRows: 412 }),
    ]);
    expect(view.rows[0]?.key).toBe("dataforseo");
  });

  it("puts the ones that work last", () => {
    const view = buildConnections([
      facts("google_search_console", { storedRows: 900, findings: 14 }),
      facts("dataforseo", { storedRows: 412 }),
    ]);
    expect(view.rows.at(-1)?.stage).toBe("reaching_you");
  });
});

describe("the tiles narrow the same set each time", () => {
  it("reads as a funnel from set up to reaching you", () => {
    const view = buildConnections([
      facts("google_search_console", { storedRows: 900, findings: 14 }),
      facts("dataforseo", { storedRows: 412 }),
      facts("umami", { configured: false }),
    ]);
    const at = (label: string) => view.tiles.find((tile) => tile.label === label)?.value;
    // Two set up: the two that appear in the reads as configured. Umami is
    // explicitly not, and every key absent from the reads counts as not
    // configured rather than as set up.
    expect(at("Accounts set up")).toBe("2");
    expect(at("Actually collecting")).toBe("2");
    expect(at("Reaching you")).toBe("1");
    expect(at("Collecting in silence")).toBe("1");
  });

  it("counts one store once, however many connections point at it", () => {
    // Both Firecrawls once shared a table, so a single set of page reads
    // rendered as two collecting connections and inflated every tile.
    const tables = CONNECTION_OUTPUTS.map((output) => output.table).filter(
      (table): table is string => table !== null,
    );
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("treats a connection with no facts at all as not configured", () => {
    // A key absent from the reads has not been proven present, and "we did not
    // look" must not render as "it is set up".
    const view = buildConnections([]);
    expect(view.rows.every((entry) => entry.stage === "not_configured")).toBe(true);
    expect(view.tiles.find((tile) => tile.label === "Accounts set up")?.value).toBe("0");
  });
});

describe("what the registry records", () => {
  it("gives every connection a plain-words promise with no jargon", () => {
    for (const output of CONNECTION_OUTPUTS) {
      expect(output.promise.length).toBeGreaterThan(20);
      expect(output.promise).not.toContain("—");
      expect(output.promise).not.toMatch(/API|endpoint|payload/);
    }
  });
});
