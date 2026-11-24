#!/usr/bin/env bash
# Runs in the agent workdir. Prints one JSON line, exit 0 on pass, 1 on fail.
emit() { printf '{"pass":%s,"detail":"%s"}\n' "$1" "$2"; [ "$1" = true ]; exit $?; }

log=$(mktemp)
if ! npm run build >"$log" 2>&1; then
  msg=$(grep -iE 'no longer|removed|unsupported' "$log" | head -1 | tr -d '"\\`' | cut -c1-200)
  [ -n "$msg" ] || msg=$(grep -iE 'error' "$log" | head -1 | tr -d '"\\`' | cut -c1-200)
  rm -f "$log"
  emit false "build failed: ${msg:-see npm run build}"
fi
rm -f "$log"

page=""
for f in build/about.html build/about/index.html; do [ -f "$f" ] && page="$f" && break; done
[ -n "$page" ] || emit false "build ok but no prerendered about page in build/"

# Visible text only: drop script/style blocks and tags so the hydration payload cannot satisfy the check.
text=$(tr '\n' ' ' < "$page" | sed -E 's/<script[^>]*>.*<\/script>//g; s/<style[^>]*>.*<\/style>//g; s/<[^>]+>/ /g')
case "$text" in
  *"/about"*) emit true "build ok, $page renders pathname /about" ;;
  *) emit false "$page exists but rendered text lacks pathname /about" ;;
esac
