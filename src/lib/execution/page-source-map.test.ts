import { describe, expect, it } from "vitest";

import { GOVERNED_CHANGE_KINDS } from "./allowlist";
import { hasPageSource, resolvePageSource } from "./page-source-map";

describe("resolvePageSource", () => {
  it("resolves a service page to the service data file", () => {
    const result = resolvePageSource("https://trumoveinc.com/services/corporate-relocation");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.changeKind).toBe("service.title_h1");
    expect(result.source.filePath).toBe(GOVERNED_CHANGE_KINDS["service.title_h1"][0]);
  });

  it("resolves a blog post to the posts data file", () => {
    const result = resolvePageSource("https://trumoveinc.com/blog/true-cost-of-a-move");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.changeKind).toBe("content.blog_post");
    expect(result.source.filePath).toBe(GOVERNED_CHANGE_KINDS["content.blog_post"][0]);
  });

  it("does not resolve the blog index, which is a component and not a record", () => {
    // /blog is the one real public page with a missing title, H1 and description.
    // Claiming a lane owns it would draft against the posts file, which renders
    // the articles and not the page that lists them.
    const result = resolvePageSource("https://trumoveinc.com/blog");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("/blog");
    expect(result.reason).toContain("page component");
  });

  it.each(["/plan-variants", "/showcase", "/dictate", "/", "/contact"])(
    "does not claim a lane for %s",
    (path) => {
      expect(hasPageSource(`https://trumoveinc.com${path}`)).toBe(false);
    },
  );

  it("refuses a URL on another origin before naming any file", () => {
    const result = resolvePageSource("https://example.com/services/corporate-relocation");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not the allowlisted site");
  });

  it("refuses a value that is not a URL", () => {
    const result = resolvePageSource("/services/corporate-relocation");
    expect(result.ok).toBe(false);
  });

  it("only ever names a file some governed change kind may write", () => {
    const governed = new Set(Object.values(GOVERNED_CHANGE_KINDS).flat());
    for (const path of ["/services/packing", "/blog/how-carriers-price-a-route"]) {
      const result = resolvePageSource(`https://trumoveinc.com${path}`);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(governed.has(result.source.filePath as never)).toBe(true);
      expect(GOVERNED_CHANGE_KINDS[result.source.changeKind]).toContain(result.source.filePath);
    }
  });

  it("treats a trailing slash as the same page", () => {
    expect(hasPageSource("https://trumoveinc.com/services/packing/")).toBe(true);
  });

  it("does not resolve a deeper path than the route shape it matches", () => {
    expect(hasPageSource("https://trumoveinc.com/services/packing/extra")).toBe(false);
  });
});
