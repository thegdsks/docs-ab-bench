import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { out, warn } from "./logger.js";
import { REPO_ROOT, validateRun, type Run } from "./schema.js";

export interface ArmStats {
  runs: number;
  passRate: number;
  tokensMean: number;
  tokensMedian: number;
  stepsMean: number;
  durationMsMean: number;
  context7CallsMean: number;
}

export interface ModeSummary {
  drivers: string[];
  models: string[];
  baseline: ArmStats | null;
  context7: ArmStats | null;
  // context7 minus baseline, null when either arm has no runs.
  delta: ArmStatsDelta | null;
}

export type ArmStatsDelta = Omit<ArmStats, "runs">;

export interface Summary {
  batch: string;
  totalRuns: number;
  subjects: Record<string, Record<string, ModeSummary>>;
}

export function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function armStats(runs: Run[]): ArmStats {
  return {
    runs: runs.length,
    passRate: mean(runs.map((r) => (r.pass ? 1 : 0))),
    tokensMean: mean(runs.map((r) => r.tokens.total)),
    tokensMedian: median(runs.map((r) => r.tokens.total)),
    stepsMean: mean(runs.map((r) => r.steps)),
    durationMsMean: mean(runs.map((r) => r.durationMs)),
    context7CallsMean: mean(runs.map((r) => r.context7Calls ?? 0)),
  };
}

function delta(a: ArmStats, b: ArmStats): ArmStatsDelta {
  return {
    passRate: b.passRate - a.passRate,
    tokensMean: b.tokensMean - a.tokensMean,
    tokensMedian: b.tokensMedian - a.tokensMedian,
    stepsMean: b.stepsMean - a.stepsMean,
    durationMsMean: b.durationMsMean - a.durationMsMean,
    context7CallsMean: b.context7CallsMean - a.context7CallsMean,
  };
}

export function summarize(batch: string, runs: Run[]): Summary {
  const subjects: Summary["subjects"] = {};
  const ids = [...new Set(runs.map((r) => r.subject))].sort();
  for (const id of ids) {
    const modes: Record<string, ModeSummary> = {};
    for (const mode of ["oneshot", "agentic"] as const) {
      const group = runs.filter((r) => r.subject === id && r.mode === mode);
      if (group.length === 0) continue;
      const base = group.filter((r) => r.arm === "baseline");
      const ctx = group.filter((r) => r.arm === "context7");
      const baseline = base.length ? armStats(base) : null;
      const context7 = ctx.length ? armStats(ctx) : null;
      modes[mode] = {
        drivers: [...new Set(group.map((r) => r.driver))].sort(),
        models: [...new Set(group.map((r) => r.model))].sort(),
        baseline,
        context7,
        delta: baseline && context7 ? delta(baseline, context7) : null,
      };
    }
    subjects[id] = modes;
  }
  return { batch, totalRuns: runs.length, subjects };
}

export function readRuns(batchDir: string): Run[] {
  if (!existsSync(batchDir)) throw new Error(`no such batch folder: ${batchDir}`);
  const runs: Run[] = [];
  for (const file of readdirSync(batchDir).sort()) {
    if (!file.endsWith(".json") || file === "summary.json") continue;
    try {
      runs.push(validateRun(JSON.parse(readFileSync(join(batchDir, file), "utf8"))));
    } catch (err) {
      warn(`skipping ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return runs;
}

const f = (v: number, d = 1): string => v.toFixed(d);

function statsLine(label: string, s: ArmStats | null): string {
  if (!s) return `  ${label.padEnd(9)} no runs`;
  return `  ${label.padEnd(9)} runs=${s.runs} pass=${f(s.passRate * 100, 0)}% tokens mean=${f(s.tokensMean, 0)} median=${f(s.tokensMedian, 0)} steps=${f(s.stepsMean)} ms=${f(s.durationMsMean, 0)} c7calls=${f(s.context7CallsMean)}`;
}

export function formatSummary(summary: Summary): string {
  const lines = [`batch ${summary.batch}, ${summary.totalRuns} runs`];
  for (const [id, modes] of Object.entries(summary.subjects)) {
    for (const [mode, m] of Object.entries(modes)) {
      lines.push("", `${id} / ${mode} (driver ${m.drivers.join(",")}, model ${m.models.join(",")})`);
      lines.push(statsLine("baseline", m.baseline), statsLine("context7", m.context7));
      if (m.delta) {
        const d = m.delta;
        lines.push(
          `  delta     pass=${f(d.passRate * 100, 0)}pp tokens mean=${f(d.tokensMean, 0)} median=${f(d.tokensMedian, 0)} steps=${f(d.stepsMean)} ms=${f(d.durationMsMean, 0)} c7calls=${f(d.context7CallsMean)}`,
        );
      }
    }
  }
  return lines.join("\n");
}

export function report(batch: string, root: string = REPO_ROOT): Summary {
  const dir = join(root, "runs", batch);
  const summary = summarize(batch, readRuns(dir));
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  out(formatSummary(summary));
  return summary;
}
