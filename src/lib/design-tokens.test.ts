import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AGENTS.md: colours come from the semantic tokens in src/styles.css, never a
 * raw palette class or hex. Eight screens had reached for amber and emerald
 * directly, so the "needs attention" yellow was three different hues, and one
 * shadow wrapped an oklch token in hsl(), which no browser renders (DS-2).
 * The recharts selector matches in ui/chart.tsx are the one place a raw hex
 * is unavoidable.
 */
const SCREEN_DIRS = ["src/routes", "src/components"];
const ALLOWED_RAW = new Set(["src/components/ui/chart.tsx"]);

const PALETTE =
  /\b(?:text|bg|border|ring|from|to|via|fill|stroke)-(?:amber|emerald|red|green|yellow|blue|orange|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;
const HSL_OF_TOKEN = /hsl\(var\(--/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function offendingLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
    .filter(({ line }) => PALETTE.test(line) || HSL_OF_TOKEN.test(line))
    .map(({ number, line }) => `${path}:${number}: ${line.trim()}`);
}

describe("every colour on screen resolves to a token", () => {
  it.each(SCREEN_DIRS.flatMap(sourceFiles).filter((path) => !ALLOWED_RAW.has(path)))(
    "%s",
    (path) => {
      expect(offendingLines(path)).toEqual([]);
    },
  );
});
