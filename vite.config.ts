// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  // Local and self-hosted builds need a runnable production server. Lovable
  // pins its own Cloudflare preset inside the Lovable build environment.
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    router: {
      // The route splitter's development-only HMR wrappers can evaluate a child
      // route against a stale parent module and collapse multiple route IDs to
      // "/". Normal Vite module updates still apply; disabling only those
      // wrappers keeps the generated route hierarchy stable during edits.
      codeSplittingOptions: { addHmr: false },
    },
  },
  vite: {
    // mcp-js 0.26 compares a POSIX repository path with a Windows-resolved
    // routes path and aborts before Vite can build. Lovable builds on Linux,
    // where the plugin remains enabled; local Windows checks skip only it.
    plugins: process.platform === "win32" ? [] : [mcpPlugin()],
  },
});
