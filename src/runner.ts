import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Arm, BenchConfig, DriverName, Mode } from "./config.js";
import { createAiSdkDriver } from "./drivers/ai-sdk.js";
import { createClaudeCodeDriver } from "./drivers/claude-code.js";
import type { Driver } from "./drivers/types.js";
import { out } from "./logger.js";
import { buildPrompt, instructionsFile } from "./prompt.js";
import { cleanEnv, execCapture, truncate } from "./sandbox.js";
import { REPO_ROOT, validateRun, type Run } from "./schema.js";
import type { LoadedSubject } from "./subjects.js";

export function driverFor(name: DriverName): Driver {
  return name === "ai-sdk" ? createAiSdkDriver() : createClaudeCodeDriver();
}

// Bump when the cache layout changes so caches built the old way are not reused.
const CACHE_LAYOUT = "layout-2-relative-bin-links";

function cacheRoot(): string {
  return join(tmpdir(), "docs-ab-bench-cache");
}

function hasDependencies(fixtureDir: string): boolean {
  const pkg = join(fixtureDir, "package.json");
  if (!existsSync(pkg)) return false;
  const json = JSON.parse(readFileSync(pkg, "utf8")) as Record<string, unknown>;
  return Boolean(json["dependencies"] || json["devDependencies"]);
}

// clonefile copy is near free on APFS, fall back to a plain copy elsewhere.
async function cloneDir(from: string, to: string): Promise<void> {
  await mkdir(to, { recursive: true });
  const ok = await new Promise<boolean>((resolve) => {
    if (process.platform !== "darwin") return resolve(false);
    execFile("cp", ["-cR", `${from}/.`, to], (err) => resolve(!err));
  });
  if (!ok) await cp(from, to, { recursive: true, verbatimSymlinks: true });
}

// Install once per subject and dependency set, keyed by manifest hash.
export async function ensureDepsCache(subject: LoadedSubject, config: BenchConfig): Promise<string | null> {
  if (!hasDependencies(subject.fixtureDir)) return null;
  const hash = createHash("sha256");
  hash.update(CACHE_LAYOUT);
  for (const name of ["package.json", "package-lock.json", ".npmrc"]) {
    const p = join(subject.fixtureDir, name);
    if (existsSync(p)) hash.update(readFileSync(p));
  }
  const dir = join(cacheRoot(), `${subject.subject.id}-${hash.digest("hex").slice(0, 12)}`);
  if (existsSync(join(dir, "node_modules"))) return dir;

  const staging = `${dir}.tmp-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  for (const name of ["package.json", "package-lock.json", ".npmrc"]) {
    const p = join(subject.fixtureDir, name);
    if (existsSync(p)) await cp(p, join(staging, name));
  }
  const hasLock = existsSync(join(staging, "package-lock.json"));
  out(`installing dependencies for ${subject.subject.id} (cached after this)`);
  const res = await execCapture("npm", [hasLock ? "ci" : "install", "--no-audit", "--no-fund"], {
    cwd: staging,
    timeoutMs: config.installTimeoutMs,
    env: { ...cleanEnv(), npm_config_loglevel: "error" },
  });
  if (res.code !== 0) {
    await rm(staging, { recursive: true, force: true });
    throw new Error(`dependency install failed for ${subject.subject.id}: ${truncate(res.output, 800)}`);
  }
  await rm(dir, { recursive: true, force: true });
  // Rename, never cp: fs.cp rewrites the relative .bin symlinks to absolute staging paths, which then dangle.
  await rename(staging, dir);
  return dir;
}

export async function prepareWorkdir(subject: LoadedSubject, config: BenchConfig): Promise<string> {
  // os.tmpdir keeps the workdir away from any repo folder that carries agent instructions.
  const workdir = await mkdtemp(join(tmpdir(), `docs-ab-bench-${subject.subject.id}-`));
  const cache = await ensureDepsCache(subject, config);
  if (cache) await cloneDir(cache, workdir);
  await cp(subject.fixtureDir, workdir, { recursive: true, filter: (src) => !src.includes("/node_modules") });
  return workdir;
}

export interface CheckResult {
  pass: boolean;
  output: string;
}

export async function runCheck(subject: LoadedSubject, workdir: string, config: BenchConfig): Promise<CheckResult> {
  const res = await execCapture(subject.checkPath, [], { cwd: workdir, timeoutMs: config.checkTimeoutMs });
  const head = res.timedOut ? "check timed out\n" : "";
  return { pass: res.code === 0 && !res.timedOut, output: truncate(head + res.output, config.toolOutputMaxChars) };
}

export function runFilePath(batch: string, subjectId: string, arm: Arm, n: number, root: string = REPO_ROOT): string {
  return join(root, "runs", batch, `${subjectId}-${arm}-${n}.json`);
}

// Validate before touching disk so an invalid record never lands in a batch.
export async function writeRun(path: string, run: Run): Promise<void> {
  const valid = validateRun(run);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
}

export interface RunOneInput {
  subject: LoadedSubject;
  arm: Arm;
  n: number;
  mode: Mode;
  driverName: DriverName;
  driver: Driver;
  model: string;
  config: BenchConfig;
  batch: string;
  root?: string;
}

export async function runOne(input: RunOneInput): Promise<{ run: Run; path: string }> {
  const { subject, config } = input;
  const maxSteps = config.maxStepsOverride ?? subject.subject.maxSteps;
  const workdir = await prepareWorkdir(subject, config);
  const instructions = instructionsFile(input.arm, config.docsHint, config.docsHintPlacement);
  if (instructions) await writeFile(join(workdir, "CLAUDE.md"), instructions);
  try {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const result = await input.driver({
      workdir,
      prompt: buildPrompt(subject.taskText, input.mode, input.arm, config.docsHint, config.docsHintPlacement),
      arm: input.arm,
      mode: input.mode,
      model: input.model,
      maxSteps,
      libraryId: subject.subject.libraryId,
      config,
    });
    const durationMs = Date.now() - t0;
    const check = await runCheck(subject, workdir, config);
    const run: Run = {
      subject: subject.subject.id,
      arm: input.arm,
      n: input.n,
      driver: input.driverName,
      model: input.model,
      pass: check.pass,
      steps: result.steps,
      toolCalls: result.toolCalls,
      context7Calls: result.context7Calls,
      tokens: result.tokens,
      costUsd: result.costUsd,
      durationMs,
      checkOutput: check.output,
      error: result.error,
      startedAt,
      mode: input.mode,
    };
    const path = runFilePath(input.batch, subject.subject.id, input.arm, input.n, input.root);
    await writeRun(path, run);
    return { run, path };
  } finally {
    if (!config.keepWork) await rm(workdir, { recursive: true, force: true });
  }
}

