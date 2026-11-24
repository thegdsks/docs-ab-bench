import { spawn } from "node:child_process";
import { cleanEnv } from "../sandbox.js";
import type { Driver, DriverInput, DriverResult } from "./types.js";

const MCP_URL = "https://mcp.context7.com/mcp";
const FILE_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];
// A denied command makes the agent stop and ask, so the shell is open but sandboxed: writes stay in the
// project folder, network is limited to the package registry, and credential folders cannot be read.
const SANDBOX_SETTINGS = JSON.stringify({
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    network: { allowedDomains: ["registry.npmjs.org", "*.npmjs.org"] },
    filesystem: {
      denyRead: ["~/.ssh", "~/.aws", "~/.config/gh", "~/.gnupg", "~/.npmrc", "~/.netrc", "~/.claude", "~/Library/Keychains"],
    },
  },
});
const MCP_ALLOW = "mcp__context7";

export function mcpConfigFor(arm: DriverInput["arm"], apiKey: string | undefined): string {
  if (arm === "baseline") return JSON.stringify({ mcpServers: {} });
  const server: Record<string, unknown> = { type: "http", url: MCP_URL };
  if (apiKey) server["headers"] = { Authorization: `Bearer ${apiKey}` };
  return JSON.stringify({ mcpServers: { context7: server } });
}

// oneshot gets file tools only, agentic adds Bash. No flag exists for turn limits, so maxSteps is a budget note only.
export function buildArgs(input: DriverInput): string[] {
  const tools = input.mode === "agentic" ? [...FILE_TOOLS, "Bash"] : FILE_TOOLS;
  const allowed = [
    ...FILE_TOOLS,
    ...(input.mode === "agentic" ? ["Bash"] : []),
    ...(input.arm === "context7" ? [MCP_ALLOW] : []),
  ];
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    input.model,
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfigFor(input.arm, input.config.context7ApiKey),
    "--tools",
    tools.join(","),
    "--allowedTools",
    allowed.join(","),
    ...(input.mode === "agentic" ? ["--settings", SANDBOX_SETTINGS] : []),
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--setting-sources",
    "project",
  ];
}

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface ResultLine {
  type: "result";
  is_error?: boolean;
  subtype?: string;
  result?: string;
  num_turns?: number;
  total_cost_usd?: number;
  usage?: Usage;
}

interface ContentBlock {
  type?: string;
  id?: string;
  name?: string;
}

interface AssistantLine {
  type: "assistant";
  message?: { content?: ContentBlock[] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

// Parse the stream, the last result line carries totals and assistant lines carry tool_use blocks.
export function parseStream(stdout: string): DriverResult {
  const toolCalls: Record<string, number> = {};
  const seen = new Set<string>();
  let result: ResultLine | undefined;

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    if (parsed["type"] === "result") result = parsed as unknown as ResultLine;
    if (parsed["type"] === "assistant") {
      const content = (parsed as unknown as AssistantLine).message?.content ?? [];
      for (const block of content) {
        if (block.type !== "tool_use" || !block.name) continue;
        if (block.id) {
          if (seen.has(block.id)) continue;
          seen.add(block.id);
        }
        toolCalls[block.name] = (toolCalls[block.name] ?? 0) + 1;
      }
    }
  }

  const context7Calls = Object.entries(toolCalls)
    .filter(([name]) => name.toLowerCase().includes("context7"))
    .reduce((sum, [, count]) => sum + count, 0);

  if (!result) {
    return {
      steps: 0,
      toolCalls,
      context7Calls,
      tokens: { input: 0, output: 0, total: 0 },
      costUsd: null,
      error: "no result line in claude output",
    };
  }

  const u = result.usage ?? {};
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const output = u.output_tokens ?? 0;
  return {
    steps: result.num_turns ?? 0,
    toolCalls,
    context7Calls,
    tokens: { input, output, total: input + output },
    costUsd: typeof result.total_cost_usd === "number" ? result.total_cost_usd : null,
    error: result.is_error ? (result.result ?? result.subtype ?? "claude reported an error") : null,
  };
}

export function createClaudeCodeDriver(bin = "claude"): Driver {
  return async (input: DriverInput): Promise<DriverResult> => {
    // Prompt goes over stdin because --tools and --mcp-config accept variadic values.
    const args = buildArgs(input);
    return new Promise<DriverResult>((resolve) => {
      const fail = (error: string): void =>
        resolve({ steps: 0, toolCalls: {}, context7Calls: 0, tokens: { input: 0, output: 0, total: 0 }, costUsd: null, error });
      const child = spawn(bin, args, { cwd: input.workdir, env: { ...cleanEnv(), ...claudeAuthEnv() } });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), input.config.agentTimeoutMs);
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", (err) => {
        clearTimeout(timer);
        fail(`could not start claude: ${err.message}`);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        const parsed = parseStream(stdout);
        if (signal === "SIGKILL") parsed.error = `claude timed out after ${input.config.agentTimeoutMs}ms`;
        else if (parsed.error === null && code !== 0) parsed.error = `claude exited ${code}: ${stderr.slice(0, 300)}`;
        resolve(parsed);
      });
      child.stdin.end(input.prompt);
    });
  };
}

// Claude Code reads its own login or key, forward only the auth variables it needs.
function claudeAuthEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}
