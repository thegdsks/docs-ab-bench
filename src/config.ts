export type Arm = "baseline" | "context7";
export type HintPlacement = "prompt" | "claude-md";
export type Mode = "oneshot" | "agentic";
export type DriverName = "ai-sdk" | "claude-code";

export interface BenchConfig {
  n: number;
  model: string | undefined;
  mode: Mode;
  docsHint: boolean;
  docsHintPlacement: HintPlacement;
  driver: DriverName;
  maxStepsOverride: number | undefined;
  agentTimeoutMs: number;
  shellTimeoutMs: number;
  checkTimeoutMs: number;
  installTimeoutMs: number;
  toolOutputMaxChars: number;
  docsMaxChars: number;
  shellAllow: string[];
  keepWork: boolean;
  context7ApiUrl: string;
  context7ApiKey: string | undefined;
}

// Fallbacks live here only, every value can be overridden by env or a CLI flag.
const FALLBACK = {
  n: 1,
  agentTimeoutMs: 900_000,
  shellTimeoutMs: 120_000,
  checkTimeoutMs: 300_000,
  installTimeoutMs: 600_000,
  toolOutputMaxChars: 20_000,
  docsMaxChars: 12_000,
  shellAllow: "npm,npx,node,ls,cat",
  context7ApiUrl: "https://context7.com/api/v3/search",
} as const;

type Env = Record<string, string | undefined>;

function positiveInt(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer, got "${raw}"`);
  }
  return value;
}

function optionalPositiveInt(env: Env, key: string): number | undefined {
  const raw = env[key];
  if (raw === undefined || raw === "") return undefined;
  return positiveInt(env, key, 1);
}

export function parseMode(value: string): Mode {
  if (value === "oneshot" || value === "agentic") return value;
  throw new Error(`mode must be oneshot or agentic, got "${value}"`);
}

export function parsePlacement(value: string): HintPlacement {
  if (value === "prompt" || value === "claude-md") return value;
  throw new Error(`BENCH_DOCS_HINT_PLACEMENT must be prompt or claude-md, got "${value}"`);
}

export function parseDriver(value: string): DriverName {
  if (value === "ai-sdk" || value === "claude-code") return value;
  throw new Error(`driver must be ai-sdk or claude-code, got "${value}"`);
}

export function loadConfig(env: Env = process.env): BenchConfig {
  return {
    n: positiveInt(env, "BENCH_N", FALLBACK.n),
    model: env["BENCH_MODEL"] || undefined,
    mode: parseMode(env["BENCH_MODE"] || "oneshot"),
    docsHint: env["BENCH_DOCS_HINT"] === "1",
    docsHintPlacement: parsePlacement(env["BENCH_DOCS_HINT_PLACEMENT"] || "prompt"),
    driver: parseDriver(env["BENCH_DRIVER"] || "ai-sdk"),
    maxStepsOverride: optionalPositiveInt(env, "BENCH_MAX_STEPS"),
    agentTimeoutMs: positiveInt(env, "BENCH_AGENT_TIMEOUT_MS", FALLBACK.agentTimeoutMs),
    shellTimeoutMs: positiveInt(env, "BENCH_SHELL_TIMEOUT_MS", FALLBACK.shellTimeoutMs),
    checkTimeoutMs: positiveInt(env, "BENCH_CHECK_TIMEOUT_MS", FALLBACK.checkTimeoutMs),
    installTimeoutMs: positiveInt(env, "BENCH_INSTALL_TIMEOUT_MS", FALLBACK.installTimeoutMs),
    toolOutputMaxChars: positiveInt(env, "BENCH_TOOL_OUTPUT_MAX_CHARS", FALLBACK.toolOutputMaxChars),
    docsMaxChars: positiveInt(env, "BENCH_DOCS_MAX_CHARS", FALLBACK.docsMaxChars),
    shellAllow: (env["BENCH_SHELL_ALLOW"] || FALLBACK.shellAllow)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    keepWork: env["BENCH_KEEP_WORK"] === "1",
    context7ApiUrl: env["CONTEXT7_API_URL"] || FALLBACK.context7ApiUrl,
    context7ApiKey: env["CONTEXT7_API_KEY"] || undefined,
  };
}

export class MissingKeyError extends Error {
  constructor(name: string, hint: string) {
    super(`${name} is not set. ${hint}`);
    this.name = "MissingKeyError";
  }
}

export function requireContext7Key(config: Pick<BenchConfig, "context7ApiKey">): string {
  if (!config.context7ApiKey) {
    throw new MissingKeyError(
      "CONTEXT7_API_KEY",
      "The context7 arm needs it. Create a free key at https://context7.com/dashboard?utm_source=gagan-deep-singh and put it in .env.",
    );
  }
  return config.context7ApiKey;
}

export function requireAnthropicKey(env: Env = process.env): string {
  const key = env["ANTHROPIC_API_KEY"];
  if (!key) {
    throw new MissingKeyError("ANTHROPIC_API_KEY", "The ai-sdk driver needs it. Put it in .env.");
  }
  return key;
}
