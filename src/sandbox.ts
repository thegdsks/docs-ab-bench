import { execFile } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

// Resolve through symlinks on the deepest existing ancestor so a link cannot point out of the workdir.
function realAncestor(path: string): string {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return realpathSync(current);
}

export function resolveInWorkdir(workdir: string, requested: string): string {
  const root = realpathSync(workdir);
  const target = resolve(root, requested);
  if (!isInside(root, target) || !isInside(root, realAncestor(target))) {
    throw new Error(`path escapes the workdir: ${requested}`);
  }
  return target;
}

const SHELL_META = /[;&|<>`$()\n\r\\]/;

export interface ShellPolicy {
  allow: string[];
  timeoutMs: number;
  maxOutputChars: number;
}

export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const m of command.matchAll(re)) tokens.push(m[1] ?? m[2] ?? m[3] ?? "");
  return tokens;
}

export function parseShellCommand(command: string, workdir: string, allow: string[]): { bin: string; args: string[] } {
  if (SHELL_META.test(command.replace(/"[^"]*"|'[^']*'/g, ""))) {
    throw new Error("shell metacharacters are not allowed, run one plain command");
  }
  const [bin, ...args] = tokenize(command);
  if (!bin || !allow.includes(bin)) {
    throw new Error(`command not allowed: ${bin ?? "(empty)"}. Allowed: ${allow.join(", ")}`);
  }
  for (const arg of args) {
    if (arg.startsWith("-") && !arg.includes("=")) continue;
    const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : arg;
    if (isAbsolute(value) || value.split(/[\\/]/).includes("..")) {
      resolveInWorkdir(workdir, value);
    }
  }
  return { bin, args };
}

// Keys never reach agent-run processes.
export function cleanEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "TMPDIR", "LANG", "TERM", "SHELL", "USER"];
  const env: NodeJS.ProcessEnv = {};
  for (const key of keep) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export interface ExecResult {
  code: number;
  output: string;
  timedOut: boolean;
}

export function execCapture(
  bin: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv; input?: string },
): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const child = execFile(
      bin,
      args,
      { cwd: opts.cwd, timeout: opts.timeoutMs, env: opts.env ?? cleanEnv(), maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`;
        if (!error) return resolvePromise({ code: 0, output, timedOut: false });
        const e = error as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
        const timedOut = e.killed === true;
        const code = typeof e.code === "number" ? e.code : 1;
        resolvePromise({ code, output: output || String(error.message), timedOut });
      },
    );
    if (opts.input !== undefined) child.stdin?.end(opts.input);
  });
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[truncated ${text.length - max} chars]`;
}
