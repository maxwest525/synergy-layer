import { describe, expect, it } from "vitest";

import { buildConnections, CONNECTION_OUTPUTS, type ConnectionFacts } from "./connections";

function facts(key: string, overrides: Partial<ConnectionFacts> = {}): ConnectionFacts {
  return { key, configured: true, storedRows: 0, findings: 0, ...overrides };
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
      facts("dataforseo", { storedRows: 412, findings: 0 }),
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

  it("says nothing when every connection reaches the operator", () => {
    const view = buildConnections(
      CONNECTION_OUTPUTS.map((output) => facts(output.key, { storedRows: 10, findings: 2 })),
    );
    expect(view.headline).toBeNull();
    expect(view.status.tone).toBe("positive");
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

  it("treats a connection with no facts at all as not configured", () => {
    // A key absent from the reads has not been proven present, and "we did not
    // look" must not render as "it is set up".
    const view = buildConnections([]);
    expect(view.rows.every((entry) => entry.stage === "not_configured")).toBe(true);
    expect(view.tiles.find((tile) => tile.label === "Accounts set up")?.value).toBe("0");
  });
});

describe("what the registry records", () => {
  it("records that only two modules can produce a finding at all", () => {
    // Not an omission in the file: nothing else in the codebase writes a
    // recommendation, which is why so much of the estate collects and stops.
    const sources = new Set(
      CONNECTION_OUTPUTS.map((output) => output.findingSource).filter(
        (source): source is string => source !== null,
      ),
    );
    expect([...sources].sort()).toEqual(["search-console", "seo-validation"]);
  });

  it("gives every connection a plain-words promise with no jargon", () => {
    for (const output of CONNECTION_OUTPUTS) {
      expect(output.promise.length).toBeGreaterThan(20);
      expect(output.promise).not.toContain("—");
      expect(output.promise).not.toMatch(/API|endpoint|payload/);
    }
  });
});
