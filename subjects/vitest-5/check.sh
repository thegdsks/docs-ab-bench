#!/usr/bin/env bash
# Runs in the agent workdir (cwd). Prints exactly one JSON line; exit 0 pass, 1 fail.
out() { printf '{"pass":%s,"detail":"%s"}\n' "$1" "$2"; [ "$1" = true ] && exit 0 || exit 1; }

f=$(ls src/*.test.js src/*.test.ts 2>/dev/null | head -1)
[ -n "$f" ] || out false "no test file in src"
grep -Eq 'expect\(\s*[A-Za-z_$][A-Za-z0-9_$.]*\s*\)\.(not\.)?toHaveBeenCalled(Times|Once)?' "$f" || out false "test file has no expect on a mock"
grep -Eq 'beforeAll' "$f" || out false "test file does not use beforeAll"
grep -Eq 'notify\(' "$f" || out false "test file never calls notify"
grep -Eq '\.(skip|todo)\b|\b(xit|xtest)\(' "$f" && out false "test is skipped"

res=$(mktemp)
trap 'rm -f "$res" "$res.o"' EXIT
npx vitest run --reporter=json --outputFile="$res" >/dev/null 2>&1
[ -s "$res" ] || out false "vitest produced no report"
node -e '
const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const p=r.numPassedTests,f=r.numFailedTests,t=r.numTotalTests;
const bad=(r.testResults||[]).flatMap(x=>x.assertionResults||[]).filter(a=>a.status==="failed").map(a=>a.title+": "+((a.failureMessages||[])[0]||"").split("\n")[0].replace(/["\\]/g,"")).join("; ");
const ok=p>=1&&f===0&&r.success===true;
console.log((ok?"1 ":"0 ")+(ok?"passed "+p+"/"+t:"failed="+f+" passed="+p+" "+bad));
' "$res" > "$res.o"
read -r flag detail < "$res.o"
[ "$flag" = 1 ] && out true "$detail" || out false "$detail"
