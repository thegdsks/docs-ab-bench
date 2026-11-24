#!/usr/bin/env bash
# Runs in the agent workdir. Prints exactly one JSON line on stdout.
LOG="$(mktemp)"

emit() { # pass(true|false) detail
  node -e 'console.log(JSON.stringify({pass: process.argv[1]==="true", detail: process.argv[2]}))' "$1" "$2"
  [ "$1" = "true" ] && exit 0 || exit 1
}

# Always sync: the cached node_modules comes from the original fixture, so a dependency the agent
# added to package.json (the 7.x markdown-remark peer) is only present after this install.
npm install --no-audit --no-fund >"$LOG" 2>&1 || emit false "npm install failed: $(tail -c 300 "$LOG" | tr '\n"' '  ')"

VER="$(node -p "require('astro/package.json').version" 2>/dev/null)"
case "$VER" in
  7.*) ;;
  *) emit false "astro version is '$VER', expected 7.x" ;;
esac

rm -rf dist
npm run build >"$LOG" 2>&1 || emit false "build failed: $(grep -v '^\s*at ' "$LOG" | grep -i -m1 -E 'error|install|not' | cut -c1-250 | tr '"' "'")"

RES="$(node -e '
const fs = require("fs");
const want = { short: 1, medium: 2, long: 3 };
const bad = [];
for (const [slug, min] of Object.entries(want)) {
  const f = `dist/posts/${slug}/index.html`;
  if (!fs.existsSync(f)) { bad.push(`${slug}: page missing`); continue; }
  const m = fs.readFileSync(f, "utf8").match(/id="reading-time"[^>]*>\s*(\d+)\s*min read\s*</);
  if (!m) bad.push(`${slug}: no #reading-time "N min read"`);
  else if (+m[1] !== min) bad.push(`${slug}: got ${m[1]} min, want ${min}`);
}
console.log(bad.join("; "));
')"

if [ -n "$RES" ]; then emit false "$RES"; fi
emit true "astro $VER built; reading time 1/2/3 min correct on short/medium/long"
