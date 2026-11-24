#!/usr/bin/env bash
# Runs in the agent workdir. Prints exactly one JSON line on stdout.

out() { printf '{"pass":%s,"detail":"%s"}\n' "$1" "$2"; [ "$1" = true ]; exit $?; }

[ -f tsconfig.json ] || out false "no tsconfig.json"
[ -x node_modules/.bin/tsc ] || npm install --no-audit --no-fund >/dev/null 2>&1
[ -x node_modules/.bin/tsc ] || out false "typescript not installed"

rm -rf dist
msg=$(npx tsc 2>&1); rc=$?
if [ $rc -ne 0 ]; then
  first=$(printf '%s' "$msg" | grep -m1 -o 'error TS[0-9]*' || echo "tsc failed")
  out false "tsc exit $rc ($first)"
fi
[ -f dist/index.js ] || out false "dist/index.js missing (rootDir layout wrong)"

run=$(node dist/index.js 2>&1); rc=$?
[ $rc -eq 0 ] || out false "node exit $rc"
expected=$(printf 'ada      9.5\nlinus    8.0')
[ "$run" = "$expected" ] || out false "unexpected output"
out true "tsc ok, dist/index.js ran with expected output"
