import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { createAgent } from "../src/agent.js";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const docsBody = {
  codeSnippets: [
    { libraryId: "/vercel/next.js", codeTitle: "Route handler", codeList: [{ code: "export async function GET() {}" }] },
  ],
  infoSnippets: [{ content: "Handlers live in route.ts" }],
};

describe("docs agent", () => {
  it("calls searchDocs and the result reaches the model", async () => {
    const fetchImpl = vi.fn(async () => Response.json(docsBody));
    let call = 0;
    let secondPrompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        call += 1;
        if (call === 1) {
          return {
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "t1",
                toolName: "searchDocs",
                input: JSON.stringify({ query: "route handler", library: "Next.js" }),
              },
            ],
            finishReason: { unified: "tool-calls" as const, raw: undefined },
            usage,
            warnings: [],
          };
        }
        secondPrompt = JSON.stringify(options.prompt);
        return {
          content: [{ type: "text" as const, text: "Use route.ts with a GET export." }],
          finishReason: { unified: "stop" as const, raw: undefined },
          usage,
          warnings: [],
        };
      },
    });

    const agent = createAgent({ model, search: { apiKey: "k", fetchImpl } });
    const result = await agent.generate({ prompt: "How do I write a Next.js route handler?" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("query")).toBe("route handler");
    expect(url.searchParams.get("library")).toBe("Next.js");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(secondPrompt).toContain("Handlers live in route.ts");
    expect(secondPrompt).toContain("/vercel/next.js");
    expect(result.text).toBe("Use route.ts with a GET export.");
  });
});
