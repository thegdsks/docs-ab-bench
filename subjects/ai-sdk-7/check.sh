#!/usr/bin/env bash
# Run inside the agent workdir. Prints one JSON line, exit 0 on pass, 1 on fail.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(pwd)"

emit() { # pass detail
  local d
  d=$(printf '%s' "$2" | head -c 600 | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"pass":%s,"detail":"%s"}\n' "$1" "$d"
  [ "$1" = true ] && exit 0 || exit 1
}

[ -f "$WORK/src/agent.ts" ] || emit false "src/agent.ts missing"
if [ ! -d "$WORK/node_modules/ai" ]; then
  (cd "$WORK" && npm install --no-audit --no-fund >/dev/null 2>&1) || emit false "npm install failed"
fi

cleanup() { rm -f "$WORK/src/hidden.test.ts"; rm -rf "$WORK/.check-dist"; }
trap cleanup EXIT

cp "$HERE/hidden/hidden.test.ts" "$WORK/src/hidden.test.ts"

out=$(cd "$WORK" && npx --no-install tsc --noEmit 2>&1) || emit false "tsc failed: $out"
out=$(cd "$WORK" && npx --no-install tsc --outDir .check-dist 2>&1) || emit false "tsc build failed: $out"
out=$(cd "$WORK" && node .check-dist/hidden.test.js 2>&1) || emit false "hidden test failed: $(printf '%s' "$out" | grep -m1 -E 'usage is not|text is not|Error' )"
emit true "type-check ok, final-step usage and text match"
