import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { MissingKeyError, requireContext7Key } from "../src/config.js";
import { createAiSdkDriver } from "../src/drivers/ai-sdk.js";
import { mcpConfigFor, parseStream } from "../src/drivers/claude-code.js";
import type { DriverInput } from "../src/drivers/types.js";
import { testConfig } from "./helpers.js";

function usage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

function toolCallStep(toolName: string, input: object, tokens: [number, number]) {
  return {
    content: [{ type: "tool-call" as const, toolCallId: `${toolName}-1`, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage: usage(...tokens),
    warnings: [],
  };
}

function textStep(text: string, tokens: [number, number]) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: usage(...tokens),
    warnings: [],
  };
}

function scriptedModel(steps: Array<ReturnType<typeof toolCallStep> | ReturnType<typeof textStep>>) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const step = steps[Math.min(i, steps.length - 1)];
      i += 1;
      if (!step) throw new Error("no scripted step");
      return step;
    },
  });
}

function input(arm: DriverInput["arm"], env: Record<string, string | undefined> = {}): DriverInput {
  return {
    workdir: mkdtempSync(join(tmpdir(), "bench-test-")),
    prompt: "do it",
    arm,
    mode: "oneshot",
    model: "test-model",
    maxSteps: 5,
    libraryId: "/toy/hello",
    config: testConfig(env),
  };
}

describe("ai-sdk driver", () => {
  it("runs a tool loop, sums tokens and counts calls", async () => {
    const i = input("baseline");
    const model = scriptedModel([
      toolCallStep("writeFile", { path: "hello.txt", content: "hello" }, [100, 10]),
      textStep("done", [150, 5]),
    ]);
    const res = await createAiSdkDriver({ model })(i);
    expect(res.error).toBeNull();
    expect(res.steps).toBe(2);
    expect(res.toolCalls).toEqual({ writeFile: 1 });
    expect(res.context7Calls).toBe(0);
    expect(res.tokens).toEqual({ input: 250, output: 15, total: 265 });
    expect(readFileSync(join(i.workdir, "hello.txt"), "utf8")).toBe("hello");
  });

  it("gives the context7 arm a searchDocs tool and counts its calls", async () => {
    const urls: string[] = [];
    const i = input("context7", { CONTEXT7_API_KEY: "ctx7sk-test" });
    const model = scriptedModel([
      toolCallStep("searchDocs", { query: "how to greet" }, [10, 1]),
      textStep("done", [10, 1]),
    ]);
    const fetchFn = async (url: string, init: { headers: Record<string, string> }) => {
      urls.push(`${url} ${init.headers["Authorization"]}`);
      return { ok: true, status: 200, text: async () => '{"infoSnippets":[]}' };
    };
    const res = await createAiSdkDriver({ model, fetchFn })(i);
    expect(res.context7Calls).toBe(1);
    expect(urls[0]).toContain("library=%2Ftoy%2Fhello");
    expect(urls[0]).toContain("query=how+to+greet");
    expect(urls[0]).toContain("Bearer ctx7sk-test");
  });

  it("fails fast with a clear message when CONTEXT7_API_KEY is missing", async () => {
    let called = false;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        called = true;
        return textStep("x", [1, 1]);
      },
    });
    await expect(createAiSdkDriver({ model })(input("context7"))).rejects.toThrow(/CONTEXT7_API_KEY is not set/);
    expect(called).toBe(false);
    expect(() => requireContext7Key({ context7ApiKey: undefined })).toThrow(MissingKeyError);
  });
});

describe("claude-code parsing", () => {
  const stream = [
    '{"type":"system","subtype":"init"}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"a","name":"Write"},{"type":"tool_use","id":"b","name":"mcp__context7__query-docs"}]}}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"b","name":"mcp__context7__query-docs"}]}}',
    '{"type":"result","subtype":"success","is_error":false,"num_turns":3,"total_cost_usd":0.0123,"usage":{"input_tokens":10,"cache_creation_input_tokens":20,"cache_read_input_tokens":30,"output_tokens":7}}',
  ].join("\n");

  it("extracts tokens, cost, turns and context7 tool calls", () => {
    const res = parseStream(stream);
    expect(res.steps).toBe(3);
    expect(res.costUsd).toBe(0.0123);
    expect(res.tokens).toEqual({ input: 60, output: 7, total: 67 });
    expect(res.toolCalls).toEqual({ Write: 1, "mcp__context7__query-docs": 1 });
    expect(res.context7Calls).toBe(1);
    expect(res.error).toBeNull();
  });

  it("reports an error when there is no result line", () => {
    expect(parseStream("garbage").error).toMatch(/no result/);
  });

  it("uses an empty MCP config for baseline and the remote server for context7", () => {
    expect(JSON.parse(mcpConfigFor("baseline", "k"))).toEqual({ mcpServers: {} });
    const c = JSON.parse(mcpConfigFor("context7", "k")) as { mcpServers: { context7: { headers: { Authorization: string } } } };
    expect(c.mcpServers.context7.headers.Authorization).toBe("Bearer k");
    expect(JSON.parse(mcpConfigFor("context7", undefined))).toHaveProperty("mcpServers.context7.url");
  });
});
