import type { Arm, BenchConfig, Mode } from "../config.js";

export interface DriverInput {
  workdir: string;
  prompt: string;
  arm: Arm;
  mode: Mode;
  model: string;
  maxSteps: number;
  libraryId: string;
  config: BenchConfig;
}

export interface DriverResult {
  steps: number;
  toolCalls: Record<string, number>;
  context7Calls: number;
  tokens: { input: number; output: number; total: number };
  costUsd: number | null;
  error: string | null;
}

export type Driver = (input: DriverInput) => Promise<DriverResult>;
