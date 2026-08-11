import { describe, expect, it } from "vitest";

import {
  assertRead,
  backlinkAuthority,
  changeStatus,
  describePageSpeed,
  pageSpeedStatus,
  STATUS_LABELS,
  EssentialsReadError,
  evidenceStatus,
  indexingStatus,
  summarizeSitemaps,
  systemGap,
  systemStatus,
  type SystemFacts,
} from "./essentials";

function system(overrides: Partial<SystemFacts>): SystemFacts {
  return {
    key: "api.example",
    name: "Example",
    installed_state: "not_installed",
    credential_state: "unknown",
    verification_state: "unverified",
    aoos_connection_state: "not_connected",
    implemented_state: "not_implemented",
    ...overrides,
  };
}

describe("essentials status derivation", () => {
  it("never presents configured credentials as connected", () => {
    const ga4 = system({ key: "api.ga4_data", name: "GA4 Data API", credential_state: "configured" });
    expect(systemStatus(ga4)).toBe("ready");
    expect(systemGap(ga4, "GA4")).toContain("not implemented or connected in AOOS");
  });

  it("treats a locally installed but unconnected system as available locally", () => {
    const openseo = system({
      key: "sys.openseo",
      name: "OpenSEO",
      installed_state: "installed",
      verification_state: "partially_live_proven",
      credential_state: "configured",
    });
    expect(systemStatus(openseo)).toBe("local");
    expect(systemGap(openseo, "OpenSEO")).toContain("not connected to AOOS");
  });

  it("separates callable and implemented from callable and partly implemented", () => {
    expect(
      systemStatus(system({ aoos_connection_state: "callable", implemented_state: "implemented" })),
    ).toBe("live");
    expect(
      systemStatus(
        system({ aoos_connection_state: "callable", implemented_state: "partially_implemented" }),
      ),
    ).toBe("partial");
  });

  it("reports an absent system as not wired", () => {
    expect(systemStatus(null)).toBe("not_wired");
    expect(systemGap(null, "PageSpeed Insights")).toContain("not wired into AOOS");
  });

  it("keeps sitemap-only indexing partial until URL inspection is wired", () => {
    expect(indexingStatus(2, false)).toBe("partial");
    expect(indexingStatus(0, false)).toBe("not_wired");
    expect(indexingStatus(2, true)).toBe("live");
  });

  it("refuses an authority claim without an explicit stored sufficiency signal", () => {
    const thin = backlinkAuthority({
      snapshotCount: 6,
      referringDomains: 1,
      backlinks: 1,
      storedSufficient: null,
    });
    expect(thin.status).toBe("partial");
    expect(thin.sufficient).toBe(false);
    expect(thin.note).toContain("No stored evidence pass");

    expect(
      backlinkAuthority({ snapshotCount: 0, referringDomains: 0, backlinks: 0, storedSufficient: null }).status,
    ).toBe("not_wired");

    // Counts alone never promote a sample to sufficient.
    expect(
      backlinkAuthority({ snapshotCount: 4, referringDomains: 24, backlinks: 120, storedSufficient: null })
        .sufficient,
    ).toBe(false);
    expect(
      backlinkAuthority({ snapshotCount: 4, referringDomains: 24, backlinks: 120, storedSufficient: false })
        .sufficient,
    ).toBe(false);
    expect(
      backlinkAuthority({ snapshotCount: 4, referringDomains: 24, backlinks: 120, storedSufficient: true })
        .sufficient,
    ).toBe(true);
  });

  it("throws a source-specific error instead of zeroing a failed read", () => {
    expect(() => assertRead("Search Console snapshots", { error: { message: "permission denied" } })).toThrow(
      EssentialsReadError,
    );
    expect(() => assertRead("Search Console snapshots", { error: { message: "permission denied" } })).toThrow(
      /Search Console snapshots could not be read: permission denied/,
    );
    const ok = assertRead("Tool systems", { error: null, data: [1] });
    expect(ok.data).toEqual([1]);
  });

  it("aggregates real sitemap payload figures and reports absence as null", () => {
    const summary = summarizeSitemaps({
      sitemap: [
        { path: "a.xml", warnings: 1, errors: 0, contents: [{ submitted: "10", indexed: "8" }] },
        { path: "b.xml", warnings: 0, errors: 2, contents: [{ submitted: 5, indexed: 5 }] },
      ],
    });
    expect(summary).toEqual({ count: 2, submitted: 15, indexed: 13, warnings: 1, errors: 2 });
    expect(summarizeSitemaps(null)).toEqual({
      count: 0,
      submitted: null,
      indexed: null,
      warnings: null,
      errors: null,
    });
  });


  it("grades stored evidence by rows, not by prose", () => {
    expect(evidenceStatus(0, true)).toBe("not_wired");
    expect(evidenceStatus(3, false)).toBe("partial");
    expect(evidenceStatus(3, true)).toBe("live");
  });

  it("only calls page changes live when one is actually awaiting a decision", () => {
    expect(changeStatus(0, 0)).toBe("not_wired");
    expect(changeStatus(0, 2)).toBe("partial");
    expect(changeStatus(1, 1)).toBe("live");
  });
});

describe("PageSpeed essentials truth", () => {
  const base = {
    implemented: true,
    attempts: 0,
    failures: 0,
    successfulSnapshots: 0,
    latestError: null,
    latestAttemptAt: null,
  };

  it("cannot regress to Not wired once an implemented attempt is stored", () => {
    const result = describePageSpeed({
      ...base,
      attempts: 2,
      failures: 2,
      latestError: "PageSpeed Insights returned HTTP 429",
    });
    expect(result.status).toBe("partial");
    expect(STATUS_LABELS[result.status]).toBe("Partial data");
    expect(result.evidence).toContain("HTTP 429");
    expect(result.evidence).not.toMatch(/zero performance measurements/);
  });

  it("never claims a measurement when only failures are stored", () => {
    const result = describePageSpeed({ ...base, attempts: 2, failures: 2 });
    expect(result.evidence).toContain("0 stored measurement(s)");
    expect(result.gap).toContain("No Lighthouse figure is shown");
  });

  it("stays Ready to connect when the bridge exists but nothing was attempted", () => {
    expect(pageSpeedStatus(base)).toBe("ready");
  });

  it("is Not wired only when no bridge is implemented", () => {
    expect(pageSpeedStatus({ ...base, implemented: false })).toBe("not_wired");
  });

  it("reports live data once a successful snapshot exists with no failures", () => {
    expect(pageSpeedStatus({ ...base, attempts: 1, successfulSnapshots: 1 })).toBe("live");
  });
});
