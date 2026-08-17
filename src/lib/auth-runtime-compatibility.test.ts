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

  it("uses one shared shell session instead of competing getSession requests", () => {
    const hook = readFileSync(`${sourceRoot}/hooks/use-operator-session.ts`, "utf8");
    const middleware = readFileSync(`${sourceRoot}/lib/server-function-auth.ts`, "utf8");
    const start = readFileSync(`${sourceRoot}/start.ts`, "utf8");
    const shell = readFileSync(`${sourceRoot}/components/os/shell.tsx`, "utf8");
    const switcher = readFileSync(`${sourceRoot}/components/os/tenant-switcher.tsx`, "utf8");

    expect(hook).not.toContain("auth.getSession(");
    expect(middleware).not.toContain("auth.getSession(");
    expect(start).toContain("functionMiddleware: [attachStoredAuth]");
    expect(shell).toContain("<TenantSwitcher session={session}");
    expect(switcher).not.toContain("useOperatorSession");
  });
});
