import { describe, expect, it } from "vitest";

import { mixedContentIn } from "./page-audit.server";

describe("mixed content scan", () => {
  it("lists http:// resources loaded through src and ignores namespace hrefs", () => {
    const html = `
      <html xmlns="http://www.w3.org/1999/xhtml">
        <link rel="profile" href="http://gmpg.org/xfn/11">
        <script src="http://cdn.example/a.js"></script>
        <img src='http://img.example/b.png'>
        <img src="https://img.example/c.png">
      </html>`;
    expect(mixedContentIn(html)).toEqual(["http://cdn.example/a.js", "http://img.example/b.png"]);
  });

  it("returns nothing for a page that loads everything over https", () => {
    expect(mixedContentIn('<img src="https://a.example/x.png">')).toEqual([]);
  });
});
