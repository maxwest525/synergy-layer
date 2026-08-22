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

  it("resolves the blog index to its own component, never to the posts file", () => {
    // /blog is the page that lists the articles; posts.ts renders the articles
    // themselves. Drafting its title against posts.ts would edit the wrong page,
    // which is why the index resolves to its component and not to the record.
    const result = resolvePageSource("https://trumoveinc.com/blog");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.changeKind).toBe("page.wording");
    expect(result.source.filePath).toBe("src/pages/blog/BlogIndexPage.tsx");
    expect(result.source.filePath).not.toBe(GOVERNED_CHANGE_KINDS["content.blog_post"][0]);
  });

  it.each([
    ["/", "src/pages/Index.tsx"],
    ["/contact", "src/pages/ContactPage.tsx"],
    ["/privacy", "src/pages/legal/PrivacyPage.tsx"],
    // The component name does not follow from the address, which is why the map
    // is transcribed from the client's router rather than derived from the URL.
    ["/saferweb", "src/pages/SafetyWebPage.tsx"],
    // Two addresses, one component. Both must resolve, or a finding on the
    // second reports no lane while the first reports one.
    ["/sms-policy", "src/pages/legal/SmsPolicyPage.tsx"],
    ["/legal/sms", "src/pages/legal/SmsPolicyPage.tsx"],
  ])("resolves the static page %s to %s", (path, file) => {
    const result = resolvePageSource(`https://trumoveinc.com${path}`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source.changeKind).toBe("page.wording");
    expect(result.source.filePath).toBe(file);
  });

  it("ignores a trailing slash, so one page is not two answers", () => {
    expect(hasPageSource("https://trumoveinc.com/contact/")).toBe(true);
    expect(hasPageSource("https://trumoveinc.com/")).toBe(true);
  });

  it.each([
    // Staff gated: not public, so no search finding can name them.
    "/plan-variants",
    "/showcase",
    "/docs",
    // Marked noindex by the client's own DefaultSeo. The site has said it does
    // not want these found; a lane that edits their wording acts against that.
    "/dictate",
    "/scanner",
    "/live-walkthrough",
    // Never a public page at all.
    "/portal/quotes",
    "/admin/json-ld",
    "/login",
    // A real public page that genuinely has no lane yet, which is the state
    // this resolver exists to say out loud.
    "/research/some-report",
  ])("does not claim a lane for %s", (path) => {
    expect(hasPageSource(`https://trumoveinc.com${path}`)).toBe(false);
  });

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
