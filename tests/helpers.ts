import { loadConfig, type BenchConfig } from "../src/config.js";
import type { Run } from "../src/schema.js";

export function testConfig(env: Record<string, string | undefined> = {}): BenchConfig {
  return loadConfig(env);
}

export function makeRun(over: Partial<Run> = {}): Run {
  return {
    subject: "toy-hello",
    arm: "baseline",
    n: 1,
    driver: "ai-sdk",
    model: "test-model",
    pass: true,
    steps: 2,
    tokens: { input: 80, output: 20, total: 100 },
    durationMs: 1000,
    startedAt: "2026-01-01T00:00:00.000Z",
    mode: "oneshot",
    ...over,
  };
}
