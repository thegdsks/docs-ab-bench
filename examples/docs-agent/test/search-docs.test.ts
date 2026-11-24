import { describe, expect, it, vi } from "vitest";
import { createSearchDocs, type SearchDocsResult } from "../src/search-docs.js";

function run(fetchImpl: typeof fetch, sleep = vi.fn(async () => {})) {
  const t = createSearchDocs({ apiKey: "k", fetchImpl, sleep });
  const exec = async () =>
    (await t.execute!({ query: "q" }, { toolCallId: "1", messages: [], context: {} })) as SearchDocsResult;
  return { exec, sleep };
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

describe("searchDocs errors", () => {
  it("404 no_documentation_found returns an empty-result error", async () => {
    const f = vi.fn(async () => json({ error: "no_documentation_found" }, 404));
    const { exec } = run(f as unknown as typeof fetch);
    expect(await exec()).toEqual({ ok: false, error: "no_documentation_found" });
    expect(f).toHaveBeenCalledOnce();
  });

  it("429 waits for Retry-After then retries", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ error: "rate_limited" }, 429, { "Retry-After": "3" }))
      .mockResolvedValueOnce(json({ infoSnippets: [{ content: "ok" }] }, 200));
    const { exec, sleep } = run(f as unknown as typeof fetch);
    expect(await exec()).toMatchObject({ ok: true, docs: "ok" });
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("429 that persists is reported, not thrown", async () => {
    const f = vi.fn(async () => json({}, 429, { "Retry-After": "1" }));
    const { exec } = run(f as unknown as typeof fetch);
    expect(await exec()).toEqual({ ok: false, error: "context7_error_429" });
  });

  it("503 retries once then reports", async () => {
    const f = vi.fn(async () => json({ error: "search_failed" }, 503));
    const { exec } = run(f as unknown as typeof fetch);
    expect(await exec()).toEqual({ ok: false, error: "context7_error_503" });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
