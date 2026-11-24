import { MockLanguageModelV4 } from 'ai/test';

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output, reasoning: undefined },
});

// Step 1 calls the weather tool, step 2 answers in text.
export function createMockModel() {
  let call = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      call += 1;
      if (call === 1) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Checking the weather.',
            },
            {
              type: 'tool-call' as const,
              toolCallId: 'call-1',
              toolName: 'weather',
              input: JSON.stringify({ city: 'Oslo' }),
            },
          ],
          finishReason: { unified: 'tool-calls' as const, raw: undefined },
          usage: usage(12, 5),
          warnings: [],
        };
      }
      return {
        content: [{ type: 'text' as const, text: 'It is 18C and cloudy in Oslo.' }],
        finishReason: { unified: 'stop' as const, raw: undefined },
        usage: usage(30, 9),
        warnings: [],
      };
    },
  });
}
