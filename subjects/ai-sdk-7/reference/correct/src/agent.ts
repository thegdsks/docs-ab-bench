import { generateText, isStepCount } from 'ai';
import { createMockModel } from './mock.js';
import { weatherTool } from './tools.js';

export interface AgentOutcome {
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  text: string;
}

export async function runAgent(): Promise<AgentOutcome> {
  const result = await generateText({
    model: createMockModel(),
    tools: { weather: weatherTool },
    stopWhen: isStepCount(5),
    prompt: 'What is the weather in Oslo?',
  });
  const { usage, text } = result.finalStep;
  return {
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
    text,
  };
}
