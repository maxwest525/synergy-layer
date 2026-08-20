import { describe, expect, it } from "vitest";

import { isRobotsPathAllowed } from "./robots-rules";

const AGENT = "Googlebot";

describe("what the old check could not see", () => {
  it("catches a rule that blocks one section, not just the whole site", () => {
    // `robotsBlocksEverything` only ever matched a bare `Disallow: /`, so a
    // robots.txt hiding half the site read as perfectly healthy.
    const body = "User-agent: *\nDisallow: /services/";
    expect(isRobotsPathAllowed(body, "/services/packing", AGENT)).toBe(false);
    expect(isRobotsPathAllowed(body, "/about", AGENT)).toBe(true);
  });

  it("still catches the whole site being blocked", () => {
    expect(isRobotsPathAllowed("User-agent: *\nDisallow: /", "/anything", AGENT)).toBe(false);
  });
});

describe("the matching rules Google actually applies", () => {
  it("treats an empty or missing file as allowing everything", () => {
    expect(isRobotsPathAllowed("", "/anything", AGENT)).toBe(true);
    expect(isRobotsPathAllowed("   \n  ", "/anything", AGENT)).toBe(true);
  });

  it("lets the longest matching rule win", () => {
    const body = "User-agent: *\nDisallow: /services/\nAllow: /services/packing";
    expect(isRobotsPathAllowed(body, "/services/packing", AGENT)).toBe(true);
    expect(isRobotsPathAllowed(body, "/services/storage", AGENT)).toBe(false);
  });

  it("lets allow win a tie against disallow", () => {
    const body = "User-agent: *\nDisallow: /a\nAllow: /a";
    expect(isRobotsPathAllowed(body, "/a", AGENT)).toBe(true);
  });

  it("expands a wildcard", () => {
    const body = "User-agent: *\nDisallow: /*.pdf";
    expect(isRobotsPathAllowed(body, "/files/report.pdf", AGENT)).toBe(false);
    expect(isRobotsPathAllowed(body, "/files/report.html", AGENT)).toBe(true);
  });

  it("honours an end anchor", () => {
    const body = "User-agent: *\nDisallow: /page$";
    expect(isRobotsPathAllowed(body, "/page", AGENT)).toBe(false);
    expect(isRobotsPathAllowed(body, "/page/sub", AGENT)).toBe(true);
  });

  it("prefers the group naming this crawler over the wildcard group", () => {
    const body = "User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /";
    expect(isRobotsPathAllowed(body, "/anything", "Googlebot")).toBe(true);
    expect(isRobotsPathAllowed(body, "/anything", "SomeOtherBot")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const body = "# a comment\nUser-agent: *\n\n  # another\nDisallow: /private # trailing";
    expect(isRobotsPathAllowed(body, "/private", AGENT)).toBe(false);
    expect(isRobotsPathAllowed(body, "/public", AGENT)).toBe(true);
  });

  it("ignores an empty disallow, which allows everything", () => {
    expect(isRobotsPathAllowed("User-agent: *\nDisallow:", "/anything", AGENT)).toBe(true);
  });

  it("does not treat a path as a regular expression", () => {
    // A literal dot must not match any character, or a rule would block more
    // than the site owner wrote.
    const body = "User-agent: *\nDisallow: /a.b";
    expect(isRobotsPathAllowed(body, "/a.b", AGENT)).toBe(false);
    expect(isRobotsPathAllowed(body, "/axb", AGENT)).toBe(true);
  });

  it("survives a malformed file rather than throwing", () => {
    for (const body of ["Disallow: /", "nonsense", "User-agent:\nDisallow:", ":::"]) {
      expect(() => isRobotsPathAllowed(body, "/x", AGENT)).not.toThrow();
    }
  });
});
