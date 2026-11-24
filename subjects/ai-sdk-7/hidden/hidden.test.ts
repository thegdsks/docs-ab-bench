import assert from 'node:assert/strict';
import { runAgent } from './agent.js';

const out = await runAgent();

// Final step only: input 30, output 9. The sum of both steps would be 42 / 14 / 56.
assert.deepEqual(
  out.usage,
  { inputTokens: 30, outputTokens: 9, totalTokens: 39 },
  `usage is not the final step only: ${JSON.stringify(out.usage)}`,
);
assert.equal(out.text, 'It is 18C and cloudy in Oslo.', `text is not the final step only: ${JSON.stringify(out.text)}`);
