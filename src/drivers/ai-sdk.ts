import { createAnthropic } from "@ai-sdk/anthropic";
import { ToolLoopAgent, isStepCount, type LanguageModel } from "ai";
import { requireAnthropicKey, requireContext7Key } from "../config.js";
import type { FetchFn } from "../docs.js";
import { SYSTEM_INSTRUCTIONS } from "../prompt.js";
import { buildTools } from "../tools.js";
import type { Driver, DriverInput, DriverResult } from "./types.js";

export interface AiSdkDriverOptions {
  // Tests inject a mock model and fetch, real runs leave both unset.
  model?: LanguageModel;
  fetchFn?: FetchFn;
}

export function createAiSdkDriver(options: AiSdkDriverOptions = {}): Driver {
  return async (input: DriverInput): Promise<DriverResult> => {
    // Fail before any model call so a missing key never produces a half-run batch.
    const apiKey = input.arm === "context7" ? requireContext7Key(input.config) : undefined;
    const model: LanguageModel =
      options.model ?? createAnthropic({ apiKey: requireAnthropicKey() })(input.model);

    const tools = buildTools({
      workdir: input.workdir,
      agentic: input.mode === "agentic",
      shellAllow: input.config.shellAllow,
      shellTimeoutMs: input.config.shellTimeoutMs,
      maxOutputChars: input.config.toolOutputMaxChars,
      docs:
        apiKey !== undefined
          ? {
              apiUrl: input.config.context7ApiUrl,
              apiKey,
              libraryId: input.libraryId,
              maxChars: input.config.docsMaxChars,
              timeoutMs: input.config.shellTimeoutMs,
              ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
            }
          : undefined,
    });

    const agent = new ToolLoopAgent({
      model,
      instructions: SYSTEM_INSTRUCTIONS,
      tools,
      stopWhen: isStepCount(input.maxSteps),
    });

    try {
      const result = await agent.generate({
        prompt: input.prompt,
        timeout: { totalMs: input.config.agentTimeoutMs },
      });
      const toolCalls: Record<string, number> = {};
      for (const call of result.toolCalls) {
        toolCalls[call.toolName] = (toolCalls[call.toolName] ?? 0) + 1;
      }
      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      return {
        steps: result.steps.length,
        toolCalls,
        context7Calls: toolCalls["searchDocs"] ?? 0,
        tokens: { input: inputTokens, output: outputTokens, total: result.usage.totalTokens ?? inputTokens + outputTokens },
        costUsd: null,
        error: null,
      };
    } catch (err) {
      return {
        steps: 0,
        toolCalls: {},
        context7Calls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        costUsd: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}
