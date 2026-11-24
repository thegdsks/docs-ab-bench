import { tool } from 'ai';
import { z } from 'zod';

export const weatherTool = tool({
  description: 'Get the current weather for a city',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ city, tempC: 18, sky: 'cloudy' }),
});
