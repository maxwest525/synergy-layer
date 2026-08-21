#!/usr/bin/env bash
# Installs node dependencies so a Claude Code on the web session can run the
# gate (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) from
# its first turn instead of discovering an empty `node_modules` mid-task.
#
# Three deliberate choices:
#
#   - Remote only. A local checkout already has its dependencies, and reaching
#     into someone's working tree at session start is not this hook's business.
#   - `npm ci`, not `npm install`. `npm install` rewrites package-lock.json when
#     it disagrees with package.json, which would hand every session a dirty
#     tree it did not create. `npm ci` installs exactly the lockfile or fails
#     loudly, which is also what CI does, so the two cannot drift.
#   - Skipped when nothing changed. `npm ci` wipes node_modules before
#     installing, so the lockfile hash is stamped after a successful run and a
#     matching stamp exits early. That keeps the cached container's
#     node_modules and makes re-running this hook free.
#
# The repository uses npm. `bun.lock` and `bunfig.toml` are also committed and
# some lane plans use `bunx`, but package-lock.json is what CI installs from.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ ! -f package-lock.json ]; then
  echo "session-start: no package-lock.json, nothing to install" >&2
  exit 0
fi

stamp="node_modules/.session-start-lockfile-sha256"
current="$(sha256sum package-lock.json | cut -d ' ' -f 1)"

if [ -d node_modules ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$current" ]; then
  echo "session-start: dependencies already match package-lock.json"
  exit 0
fi

npm ci --no-audit --no-fund

printf '%s' "$current" > "$stamp"
echo "session-start: dependencies installed from package-lock.json"
