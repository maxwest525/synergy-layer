#!/usr/bin/env bash
# Blocks `git commit` when the staged changes contain fake wiring.
#
# Ported from the operator's own `mark` repo, where it exists because two days
# were once lost to a pipeline that looked busy and was doing nothing. A stub
# that returns a plausible value is indistinguishable from working code until
# someone checks, and by then the trust is gone. exit 2 is a hard block.
#
# Scoped deliberately:
#   - stub markers are checked only in staged `src/**` TypeScript, because tests
#     and docs legitimately contain the words
#   - credential placeholders are checked everywhere except this hooks directory
#     and markdown, which define and discuss the marker strings and would
#     otherwise trip on themselves
# Fails open on any unexpected error: this must never block a legitimate commit
# because of its own bug.
set -uo pipefail

payload="$(cat)"
cmd="$(printf '%s' "$payload" | python3 -c "import sys,json;print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null || true)"
case "$cmd" in
  *'git commit'*) ;;
  *) exit 0 ;;
esac

# 1) Code stubs presented as working, in staged source only.
src_added="$(git diff --cached --unified=0 -- 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null | grep '^+' | grep -v '^+++' || true)"
src_markers='NotImplemented|not implemented|TODO:[[:space:]]*wire|FIXME:[[:space:]]*wire|return mock|//[[:space:]]*stub|throw new Error\("unimplemented'
src_hits="$(printf '%s' "$src_added" | grep -nE "$src_markers" || true)"

# 2) Credential placeholders, anywhere but this directory and markdown.
all_added="$(git diff --cached --unified=0 -- ':(exclude).claude/hooks' ':(exclude,glob)**/*.md' 2>/dev/null | grep '^+' | grep -v '^+++' || true)"
cred_markers='YOUR_API_KEY|your-api-key|REPLACE_ME|REPLACE-ME|PUT_YOUR_.*_HERE|sk-xxx'
cred_hits="$(printf '%s' "$all_added" | grep -nE "$cred_markers" || true)"

if [ -n "$src_hits" ] || [ -n "$cred_hits" ]; then
  echo 'no-fake-wiring: staged changes contain stubs or placeholder credentials.' >&2
  echo 'Wire it for real or remove it before committing:' >&2
  { printf '%s\n' "$src_hits"; printf '%s\n' "$cred_hits"; } | grep -v '^$' | head -20 >&2
  exit 2
fi
exit 0
