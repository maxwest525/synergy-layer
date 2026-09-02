import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONNECTION_OUTPUTS, FINDING_SOURCES, NEWEST_ROW_COLUMN } from "./connections";
import { CONNECTOR_CATALOG } from "./connectors/catalog";

/**
 * The registry in `connections.ts` is a claim about the rest of the codebase:
 * these connectors exist, they write to these tables, and these modules turn
 * their rows into findings. A claim like that goes stale silently - the first
 * version of it said Google Analytics produced no findings while
 * `ga4-rules.server.ts` was writing them on a daily schedule, and every unit
 * test passed, because they all tested the registry against itself.
 *
 * So these tests read the source. They fail when the codebase and the registry
 * drift apart, which is the only failure mode that matters here.
 */

const SOURCE_ROOT = join(process.cwd(), "src");

function serverModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return serverModules(path);
    return entry.isFile() && entry.name.endsWith(".server.ts") ? [path] : [];
  });
}

/** Every `source_module` literal written into `recommendations`, from source. */
function writersInCodebase(): Map<string, string> {
  const found = new Map<string, string>();
  for (const path of serverModules(SOURCE_ROOT)) {
    const source = readFileSync(path, "utf8");
    // Only files that insert recommendations. `source_module` is also a column
    // on `inbox_items`, which is a different pipeline and not this page's
    // subject.
    if (!source.includes('from("recommendations")')) continue;
    for (const match of source.matchAll(/source_module:\s*"([^"]+)"/g)) {
      found.set(match[1]!, path);
    }
  }
  return found;
}

describe("the registry matches the codebase it describes", () => {
  it("records every module that writes a recommendation", () => {
    const writers = writersInCodebase();
    // Sorted for a readable diff: this assertion failing tells you which module
    // appeared, and `connections.ts` needs a connection pointed at it.
    expect([...writers.keys()].sort()).toEqual([...FINDING_SOURCES].sort());
  });

  it("claims a finding source only for a module that reads the connection's table", () => {
    const writers = writersInCodebase();
    for (const output of CONNECTION_OUTPUTS) {
      for (const source of output.findingSources) {
        const path = writers.get(source);
        expect(path, `${source} writes no recommendation`).toBeDefined();
        expect(
          readFileSync(path!, "utf8"),
          `${output.label} credits ${source}, which never reads ${output.table}`,
        ).toContain(`from("${output.table}")`);
      }
    }
  });

  it("names only connectors the catalog knows", () => {
    const known = new Set(CONNECTOR_CATALOG.map((connector) => connector.key as string));
    for (const output of CONNECTION_OUTPUTS) {
      expect(known, `${output.key} is not a connector`).toContain(output.key);
    }
  });

  it("points every table at something that actually writes to it", () => {
    const everySource = serverModules(SOURCE_ROOT)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const output of CONNECTION_OUTPUTS) {
      if (output.table === null) continue;
      expect(
        everySource,
        `nothing writes ${output.table}, so ${output.label} can never collect`,
      ).toContain(`from("${output.table}")`);
    }
  });

  it("leaves no link pointing at the registry's old address", () => {
    // `/capabilities` used to be the capability registry and is now this
    // category page. Every link that meant the registry had to move with it,
    // and one was missed - in the same file the move was already editing, on a
    // second back-link below the first.
    const offenders: string[] = [];
    for (const dir of ["routes", "components", "lib"]) {
      for (const path of readdirSync(join(SOURCE_ROOT, dir), {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!path.isFile() || !/\.tsx?$/.test(path.name) || path.name.includes(".test.")) continue;
        const file = join(path.parentPath ?? path.path, path.name);
        const source = readFileSync(file, "utf8");
        // The route definition itself must say "/capabilities"; a link must not.
        if (source.includes('createFileRoute("/capabilities")')) continue;
        if (/(?:to|href)=\{?"\/capabilities"/.test(source)) offenders.push(file);
      }
    }
    expect(offenders, "these link to the category page where they meant the registry").toEqual([]);
  });

  it("names the newest-row column for every stored table", () => {
    // Without it the date on the Connections page would read "never", which
    // is an accusation, not an absence.
    for (const output of CONNECTION_OUTPUTS) {
      if (output.table === null) continue;
      expect(
        NEWEST_ROW_COLUMN[output.table as keyof typeof NEWEST_ROW_COLUMN],
        `${output.table} has no newest-row column`,
      ).toBeDefined();
    }
  });

  it("gives a connection with no store no finding source either", () => {
    // A connection nothing collects for cannot have produced a finding, so
    // crediting it with one would be crediting it with another's work.
    for (const output of CONNECTION_OUTPUTS) {
      if (output.table === null) {
        expect(output.findingSources, `${output.label} has no table`).toEqual([]);
      }
    }
  });
});
