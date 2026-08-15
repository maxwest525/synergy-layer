import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button";

const routesDirectory = fileURLToPath(new URL("../routes/", import.meta.url));

describe("AOOS operator surface", () => {
  it("does not expose a standalone manual title/H1 proposal entry point", () => {
    const actionCenter = readFileSync(`${routesDirectory}/index.tsx`, "utf8");

    expect(actionCenter).not.toContain("New title/H1 proposal");
    expect(actionCenter).not.toContain('to="/changes/new"');
    expect(existsSync(`${routesDirectory}/changes.new.tsx`)).toBe(false);
  });

  it("uses a restrained outlined default action instead of a solid green fill", () => {
    const classes = buttonVariants();

    expect(classes).toContain("border");
    expect(classes).toContain("text-primary");
    expect(classes.split(" ")).not.toContain("bg-primary");
  });
});
