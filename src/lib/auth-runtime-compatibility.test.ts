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

  it("does not start a competing getSession request from the shell hook", () => {
    const source = readFileSync(`${sourceRoot}/hooks/use-operator-session.ts`, "utf8");

    expect(source).not.toContain("auth.getSession(");
  });

  it("shares the shell session with the tenant switcher", () => {
    const source = readFileSync(`${sourceRoot}/components/os/tenant-switcher.tsx`, "utf8");

    expect(source).not.toContain("useOperatorSession");
  });
});
