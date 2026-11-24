import { generateText, stepCountIs } from 'ai';
import { createMockModel } from './mock.js';
import { weatherTool } from './tools.js';

export interface AgentOutcome {
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  text: string;
}

// AI SDK 6 habit: result.usage was the final step, result.text the final text.
export async function runAgent(): Promise<AgentOutcome> {
  const result = await generateText({
    model: createMockModel(),
    tools: { weather: weatherTool },
    stopWhen: stepCountIs(5),
    prompt: 'What is the weather in Oslo?',
  });
  return {
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      totalTokens: result.usage.totalTokens ?? 0,
    },
    text: result.text,
  };
}
