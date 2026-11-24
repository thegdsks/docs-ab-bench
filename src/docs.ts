export type FetchFn = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface DocsClient {
  apiUrl: string;
  apiKey: string;
  libraryId: string;
  maxChars: number;
  timeoutMs: number;
  fetchFn?: FetchFn;
}

// type=json keeps the response compact and parseable, the model gets snippets as text.
export async function searchDocs(client: DocsClient, query: string): Promise<string> {
  const url = new URL(client.apiUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("library", client.libraryId);
  url.searchParams.set("type", "json");
  const doFetch: FetchFn = client.fetchFn ?? ((u, init) => fetch(u, init));
  const res = await doFetch(url.toString(), {
    headers: { Authorization: `Bearer ${client.apiKey}` },
    signal: AbortSignal.timeout(client.timeoutMs),
  });
  const body = await res.text();
  if (res.status === 404) return "No documentation found for this query.";
  if (!res.ok) return `Docs search failed with status ${res.status}: ${body.slice(0, 300)}`;
  return body.length <= client.maxChars ? body : `${body.slice(0, client.maxChars)}\n[truncated]`;
}
