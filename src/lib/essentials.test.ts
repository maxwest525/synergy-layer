import { describe, expect, it } from "vitest";

import {
  backlinkAuthority,
  changeStatus,
  evidenceStatus,
  indexingStatus,
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

  it("refuses an authority claim on an insufficient backlink sample", () => {
    const thin = backlinkAuthority({ snapshotCount: 6, referringDomains: 1, backlinks: 1 });
    expect(thin.status).toBe("partial");
    expect(thin.sufficient).toBe(false);
    expect(thin.note).toContain("too small");

    expect(backlinkAuthority({ snapshotCount: 0, referringDomains: 0, backlinks: 0 }).status).toBe(
      "not_wired",
    );
    expect(
      backlinkAuthority({ snapshotCount: 4, referringDomains: 24, backlinks: 120 }).sufficient,
    ).toBe(true);
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
