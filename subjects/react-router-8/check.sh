#!/usr/bin/env bash
# Runs in the agent workdir. Prints exactly one JSON line on stdout, exit 0 pass, 1 fail.
LOG="$(mktemp)"
trap 'rm -rf "$LOG" .check' EXIT

emit() { # $1 pass(true|false) $2 detail
  node -e 'console.log(JSON.stringify({pass:process.argv[1]==="true",detail:process.argv[2].slice(0,600)}))' "$1" "$2"
  [ "$1" = "true" ]
  exit $?
}

[ -f app/routes/product.tsx ] || emit false "app/routes/product.tsx is missing"

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund >"$LOG" 2>&1 || emit false "npm install failed: $(tail -3 "$LOG" | tr '\n' ' ')"
fi

# 1. type-check against the pinned react-router 8 types
npm run typecheck >"$LOG" 2>&1 || emit false "typecheck failed: $(grep -m3 'error' "$LOG" | cut -c1-200 | tr '\n' ' ')"

# 2. behaviour: meta title from loader data, middleware sets the header
mkdir -p .check
cat >.check/vitest.config.ts <<'EOF'
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: [".check/*.test.ts"] } });
EOF
cat >.check/route.test.ts <<'EOF'
import { RouterContextProvider } from "react-router";
import { expect, test } from "vitest";
import * as mod from "../app/routes/product";

type Loose = {
  loader: (a: unknown) => Promise<{ title: string }> | { title: string };
  meta: (a: unknown) => unknown;
  middleware: Array<(a: unknown, next: () => Promise<Response>) => Promise<unknown>>;
};
const route = mod as unknown as Loose;

const args = () => ({
  request: new Request("http://localhost/product"),
  url: new URL("http://localhost/product"),
  pattern: "/product",
  params: {},
  context: new RouterContextProvider(),
});

test("meta sets the title from loader data", async () => {
  const loaderData = await route.loader(args());
  expect(typeof loaderData.title).toBe("string");
  const tags = route.meta({
    loaderData,
    params: {},
    matches: [],
    location: { pathname: "/product", search: "", hash: "", state: null, key: "k" },
  });
  expect(tags).toContainEqual({ title: `${loaderData.title} | Shop` });
});

test("middleware sets X-Shop-Route", async () => {
  const mw = route.middleware;
  expect(Array.isArray(mw)).toBe(true);
  const downstream = new Response("ok");
  const result = await mw[0](args(), async () => downstream);
  const res = result instanceof Response ? result : downstream;
  expect(res.headers.get("X-Shop-Route")).toBe("product");
});
EOF
npx vitest run --config .check/vitest.config.ts >"$LOG" 2>&1 || emit false "behaviour test failed: $(grep -m4 -E 'Error|expected|FAIL' "$LOG" | cut -c1-200 | tr '\n' ' ')"

emit true "typecheck and behaviour test passed (meta title from loaderData, X-Shop-Route header)"
