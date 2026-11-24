export interface AgentOutcome {
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  text: string;
}

export async function runAgent(): Promise<AgentOutcome> {
  throw new Error('not implemented');
}
