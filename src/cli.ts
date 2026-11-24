import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, parseDriver, parseMode, requireAnthropicKey, requireContext7Key, type Arm, type BenchConfig } from "./config.js";
import { out } from "./logger.js";
import { report } from "./report.js";
import { driverFor, runFilePath, runOne } from "./runner.js";
import { REPO_ROOT } from "./schema.js";
import { verifySubjects } from "./verify.js";
import { listSubjectIds, loadSubject, resolveSubjectIds } from "./subjects.js";

const USAGE = `usage:
  bench list
  bench run --subject <id|all> --arm baseline|context7|both --n <int> --mode oneshot|agentic --driver ai-sdk|claude-code --model <id> --batch <name> [--max-steps <int>] [--force]
  bench verify [--subject <id|all>]
  bench report --batch <name>`;

function intFlag(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1) throw new Error(`--${name} must be a positive integer`);
  return v;
}

function cmdList(): void {
  for (const id of listSubjectIds()) {
    const { subject } = loadSubject(id);
    out(`${id}\t${subject.library} ${subject.versionBefore} -> ${subject.versionAfter}\t${subject.role ?? "-"}\tmaxSteps=${subject.maxSteps}`);
  }
}

async function cmdRun(argv: string[], baseConfig: BenchConfig): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      subject: { type: "string" },
      arm: { type: "string", default: "both" },
      n: { type: "string" },
      mode: { type: "string" },
      driver: { type: "string" },
      model: { type: "string" },
      batch: { type: "string" },
      "max-steps": { type: "string" },
      force: { type: "boolean", default: false },
    },
  });
  if (!values.subject) throw new Error("--subject is required");
  const mode = values.mode ? parseMode(values.mode) : baseConfig.mode;
  const driverName = values.driver ? parseDriver(values.driver) : baseConfig.driver;
  const model = values.model ?? baseConfig.model;
  if (!model) throw new Error("model not set: pass --model or set BENCH_MODEL");
  const n = intFlag(values.n, "n") ?? baseConfig.n;
  const config: BenchConfig = { ...baseConfig, maxStepsOverride: intFlag(values["max-steps"], "max-steps") ?? baseConfig.maxStepsOverride };
  const arms: Arm[] = values.arm === "both" ? ["baseline", "context7"] : values.arm === "baseline" || values.arm === "context7" ? [values.arm] : [];
  if (arms.length === 0) throw new Error("--arm must be baseline, context7 or both");
  const batch = values.batch ?? `batch-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  // Check keys before the first run so a missing key never leaves a half batch.
  if (driverName === "ai-sdk") {
    requireAnthropicKey();
    if (arms.includes("context7")) requireContext7Key(config);
  }

  const ids = resolveSubjectIds(values.subject);
  if (ids.length === 0) throw new Error("no subjects found");
  const subjects = ids.map((id) => loadSubject(id));
  const driver = driverFor(driverName);

  for (const subject of subjects) {
    for (let i = 1; i <= n; i++) {
      for (const arm of arms) {
        const path = runFilePath(batch, subject.subject.id, arm, i);
        if (!values.force && existsSync(path)) {
          out(`skip ${subject.subject.id} ${arm} #${i} (exists)`);
          continue;
        }
        const { run } = await runOne({ subject, arm, n: i, mode, driverName, driver, model, config, batch });
        out(`${subject.subject.id} ${arm} #${i}: pass=${run.pass} steps=${run.steps} tokens=${run.tokens.total} ${run.error ? `error=${run.error}` : ""}`.trimEnd());
      }
    }
  }
  out(`wrote ${join("runs", batch)}`);
}

async function main(): Promise<void> {
  const envFile = join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const [command, ...rest] = process.argv.slice(2);
  const config = loadConfig();
  if (command === "list") return cmdList();
  if (command === "run") return cmdRun(rest, config);
  if (command === "verify") {
    const { values } = parseArgs({ args: rest, options: { subject: { type: "string", default: "all" } } });
    const subjects = resolveSubjectIds(values.subject ?? "all").map((id) => loadSubject(id));
    if (subjects.length === 0) throw new Error("no subjects found");
    if (!(await verifySubjects(subjects, config))) process.exitCode = 1;
    return;
  }
  if (command === "report") {
    const { values } = parseArgs({ args: rest, options: { batch: { type: "string" } } });
    if (!values.batch) throw new Error("--batch is required");
    report(values.batch);
    return;
  }
  out(USAGE);
  if (command !== undefined) process.exitCode = 1;
}

main().catch((err: unknown) => {
  process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
