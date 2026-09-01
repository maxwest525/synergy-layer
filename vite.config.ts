// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { createLogger } from "vite";

// A browser that cancels an in-flight request makes Node raise
// `Error: aborted` from `abortIncoming`/`socketOnClose`. Vite's dev logger
// prints it as an SSR error, which the preview promotes to a crash dialog.
// It is a transport cancellation, never an application failure, so drop only
// that exact signature and keep every other error visible.
const isClientDisconnectLog = (message: string): boolean =>
  message.includes("Error: aborted") &&
  message.includes("node:_http_server") &&
  (message.includes("abortIncoming") || message.includes("socketOnClose"));

const baseLogger = createLogger();
const quietDisconnectLogger = {
  ...baseLogger,
  error(message: string, options?: Parameters<typeof baseLogger.error>[1]) {
    if (isClientDisconnectLog(message)) return;
    baseLogger.error(message, options);
  },
  warn(message: string, options?: Parameters<typeof baseLogger.warn>[1]) {
    if (isClientDisconnectLog(message)) return;
    baseLogger.warn(message, options);
  },
};

const stableGeneratedAuthRequestHelper = {
  name: "stable-generated-auth-request-helper",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.endsWith("/src/integrations/supabase/auth-middleware.ts")) return null;
    return code.replace(
      'from "@tanstack/react-start/server"',
      'from "@tanstack/start-server-core"',
    );
  },
};

export default defineConfig({
  // Local and self-hosted builds need a runnable production server. Lovable
  // pins its own Cloudflare preset inside the Lovable build environment.
  // On Vercel (which sets VERCEL=1 in its build container) the build must
  // emit the Build Output API layout instead: with node-server, Vercel's
  // framework detection looked for a "dist" directory that never exists and
  // failed the deploy after a successful compile.
  nitro: { preset: process.env["VERCEL"] ? "vercel" : "node-server" },
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
    plugins:
      process.platform === "win32"
        ? [stableGeneratedAuthRequestHelper]
        : [stableGeneratedAuthRequestHelper, mcpPlugin()],
    customLogger: quietDisconnectLogger,
    // zod v4's core modules import each other circularly. When the route
    // splitter emits the chat route as a lazy chunk, that cycle can evaluate
    // `api.js` before `util.js` finishes, so `util.normalizeParams` is
    // undefined and the page blanks. Prebundling zod (and the AI SDK that
    // pulls it in) flattens the cycle into one stable module.
    optimizeDeps: {
      include: ["zod", "zod/v4/core", "ai", "@ai-sdk/react"],
    },
    ssr: {
      // A stale SSR prebundle of the framework server helpers resolves
      // `getRequestHeader` to undefined and crashes every authenticated server
      // function. Loading them from source keeps the exports live.
      optimizeDeps: {
        exclude: [
          "@tanstack/react-start",
          "@tanstack/react-start/server",
          // `@tanstack/react-start/server` is only a two-hop `export *` chain.
          // If either hop is prebundled while the other is loaded from source,
          // the re-exported helpers resolve to undefined and every
          // authenticated server function dies on `getRequestHeader`.
          "@tanstack/react-start-server",
          "@tanstack/start-server-core",
        ],
      },
    },
  },
});
