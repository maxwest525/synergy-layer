import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));

describe("Lovable preview auth runtime compatibility", () => {
  it.each(["integrations/supabase/auth-middleware.ts", "lib/tenant.server.ts"])(
    "reads the authorization header without the unavailable getRequest export in %s",
    (file) => {
      const source = readFileSync(`${sourceRoot}/${file}`, "utf8");

      expect(source).toContain("getRequestHeader");
      expect(source).not.toMatch(/\bgetRequest\s*\(/);
    },
  );
});
