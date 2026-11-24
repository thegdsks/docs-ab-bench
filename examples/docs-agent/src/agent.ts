import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, ToolLoopAgent, type LanguageModel } from "ai";
import { createSearchDocs, type SearchDocsOptions } from "./search-docs.js";

export const INSTRUCTIONS = `You are a coding assistant.
Before answering any question about a library or framework, call searchDocs and base your answer on what it returns.
If searchDocs reports no documentation, say so and answer from general knowledge.`;

export function createAgent(opts: {
  search: SearchDocsOptions;
  model?: LanguageModel;
}) {
  return new ToolLoopAgent({
    model: opts.model ?? anthropic(process.env.ANTHROPIC_MODEL ?? ""),
    instructions: INSTRUCTIONS,
    tools: { searchDocs: createSearchDocs(opts.search) },
    stopWhen: isStepCount(Number(process.env.MAX_STEPS ?? 6)),
  });
}
