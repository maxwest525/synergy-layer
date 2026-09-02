import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AGENTS.md, copy style: no em dashes. They had crept into a redesign page,
 * the consequence copy every suggestion card renders, the "no value" glyph on
 * twenty-five metric cells, and most browser-tab titles (COPY-2). This walks
 * every screen file and the modules whose strings reach the screen, skipping
 * comment lines, and fails on the first one back.
 */
const SCREEN_DIRS = ["src/routes", "src/components"];

/** Library modules whose sentences render to the operator. */
const COPY_MODULES = [
  "src/lib/action-center.ts",
  "src/lib/dataforseo/competitor-pages.server.ts",
  "src/lib/execution/page-source-map.ts",
  "src/lib/knowledge-retrieval.server.ts",
  "src/lib/knowledge/outcome-sources.ts",
  "src/lib/onpage-rule-checks.ts",
  "src/lib/outcome-verdict.ts",
  "src/lib/page-checks.ts",
  "src/lib/suggestion-verbs.ts",
  "src/lib/web-research.server.ts",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function emDashLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.includes("\u2014"))
    .filter(({ line }) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
    .map(({ number, line }) => `${path}:${number}: ${line.trim()}`);
}

describe("operator copy carries no em dashes", () => {
  it.each([...SCREEN_DIRS.flatMap(sourceFiles), ...COPY_MODULES])("%s", (path) => {
    expect(emDashLines(path)).toEqual([]);
  });
});
