import { describe, expect, it } from "vitest";

import { GOVERNED_BRANCH, GOVERNED_FILE, GOVERNED_PROJECT_ID, GOVERNED_REPO } from "./allowlist";
import { buildReadiness } from "./execution.functions";

const base = {
  executorCredentialPresent: true,
  rendererCredentialPresent: true,
  repo: GOVERNED_REPO,
  branch: GOVERNED_BRANCH,
  filePath: GOVERNED_FILE,
  projectId: GOVERNED_PROJECT_ID,
  baseRevision: "base-sha-0000000000",
  targetUrl: "https://trumoveinc.com/services/corporate-relocation",
  changeCount: 2,
  preflight: null,
};

function fact(facts: ReturnType<typeof buildReadiness>, label: string) {
  const found = facts.find((entry) => entry.label === label);
  if (!found) throw new Error(`No readiness fact labelled ${label}.`);
  return found;
}

describe("buildReadiness source-file fact", () => {
  it("keeps the title/H1 governed file stored", () => {
    const found = fact(buildReadiness(base), "Exact source file");
    expect(found.state).toBe("stored");
    expect(found.detail).toContain(GOVERNED_FILE);
    expect(found.detail).toContain("service.title_h1");
  });

  it("reports a page.metadata source file as stored, not blocked", () => {
    const found = fact(
      buildReadiness({ ...base, filePath: "src/components/seo/SeoHead.tsx" }),
      "Exact source file",
    );
    expect(found.state).toBe("stored");
    expect(found.detail).toContain("src/components/seo/SeoHead.tsx");
    expect(found.detail).toContain("page.metadata");
  });

  it("reports a site.crawl_directives source file as stored", () => {
    const found = fact(
      buildReadiness({ ...base, filePath: "public/robots.txt" }),
      "Exact source file",
    );
    expect(found.state).toBe("stored");
    expect(found.detail).toContain("site.crawl_directives");
  });

  it("blocks a file no governed change kind owns, naming the allowed files", () => {
    const found = fact(buildReadiness({ ...base, filePath: "src/evil.ts" }), "Exact source file");
    expect(found.state).toBe("blocked");
    expect(found.detail).toContain("src/evil.ts");
    expect(found.detail).toContain(GOVERNED_FILE);
    expect(found.detail).toContain("src/components/seo/SeoHead.tsx");
  });

  it("blocks a missing file plainly", () => {
    const found = fact(buildReadiness({ ...base, filePath: null }), "Exact source file");
    expect(found.state).toBe("blocked");
    expect(found.detail).toContain("no file");
  });
});
