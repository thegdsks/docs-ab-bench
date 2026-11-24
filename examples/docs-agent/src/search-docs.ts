import { tool } from "ai";
import { z } from "zod";

const ENDPOINT = "https://context7.com/api/v3/search";

type Snippets = {
  codeSnippets?: { libraryId: string; codeTitle: string; codeList: { code: string }[] }[];
  infoSnippets?: { content: string }[];
};

export type SearchDocsResult =
  | { ok: true; docs: string; sources: string[] }
  | { ok: false; error: string };

export type SearchDocsOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxSnippets?: number;
};

// Errors come back as data so the model can answer without docs instead of crashing the loop.
export function createSearchDocs(opts: SearchDocsOptions) {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxSnippets = opts.maxSnippets ?? Number(process.env.CONTEXT7_MAX_SNIPPETS ?? 5);

  async function call(query: string, library?: string): Promise<Response> {
    const url = new URL(ENDPOINT);
    url.searchParams.set("query", query);
    url.searchParams.set("type", "json");
    if (library) url.searchParams.set("library", library);
    return doFetch(url, { headers: { Authorization: `Bearer ${opts.apiKey}` } });
  }

  async function search(query: string, library?: string): Promise<SearchDocsResult> {
    let res = await call(query, library);
    // One retry is enough for a transient limit or outage, then report it.
    if (res.status === 429 || res.status === 503) {
      await sleep(Number(res.headers.get("Retry-After") ?? 1) * 1000);
      res = await call(query, library);
    }
    if (res.status === 404) return { ok: false, error: "no_documentation_found" };
    if (!res.ok) return { ok: false, error: `context7_error_${res.status}` };

    const data = (await res.json()) as Snippets;
    const code = (data.codeSnippets ?? []).slice(0, maxSnippets);
    const info = (data.infoSnippets ?? []).slice(0, maxSnippets);
    const docs = [
      ...code.map((s) => `## ${s.codeTitle}\n${s.codeList.map((c) => c.code).join("\n")}`),
      ...info.map((s) => s.content),
    ].join("\n\n");
    return { ok: true, docs, sources: [...new Set(code.map((s) => s.libraryId))] };
  }

  return tool({
    description: "Search up-to-date library documentation. Returns code examples and notes.",
    inputSchema: z.object({
      query: z.string().describe("What you need to know, in plain language"),
      library: z.string().optional().describe("Library name or id, for example Next.js"),
    }),
    execute: ({ query, library }) => search(query, library),
  });
}
