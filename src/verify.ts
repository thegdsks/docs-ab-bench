import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { BenchConfig } from "./config.js";
import { out } from "./logger.js";
import { prepareWorkdir, runCheck } from "./runner.js";
import type { LoadedSubject } from "./subjects.js";

export type Stage = "fixture" | "correct" | "stale";

// The untouched fixture and the stale reference must fail, the correct reference must pass.
export const EXPECTED_PASS: Record<Stage, boolean> = { fixture: false, correct: true, stale: false };

export interface StageResult {
  stage: Stage;
  expected: boolean;
  pass: boolean;
  met: boolean;
  detail: string;
}

export type CheckFn = (workdir: string) => Promise<{ pass: boolean; output: string }>;

export function hasReference(subject: LoadedSubject, name: string): boolean {
  return existsSync(join(subject.dir, "reference", name));
}

// Copies the files under reference/<name>/ over the workdir; files absent from the overlay stay.
export async function overlayReference(subject: LoadedSubject, name: string, workdir: string): Promise<void> {
  const from = join(subject.dir, "reference", name);
  if (!existsSync(from)) throw new Error(`subject ${subject.subject.id}: reference/${name} is missing`);
  await cp(from, workdir, { recursive: true, force: true, verbatimSymlinks: true });
}

export function judge(stage: Stage, pass: boolean, detail: string): StageResult {
  const expected = EXPECTED_PASS[stage];
  return { stage, expected, pass, met: pass === expected, detail };
}

export interface VerifyOutcome {
  id: string;
  stages: StageResult[];
  ok: boolean;
  skipped: boolean;
}

// Each stage gets a fresh workdir so one overlay never leaks into the next.
export async function verifySubject(
  subject: LoadedSubject,
  prepare: (s: LoadedSubject) => Promise<string>,
  check: CheckFn,
): Promise<VerifyOutcome> {
  const id = subject.subject.id;
  if (!hasReference(subject, "correct") && !hasReference(subject, "stale")) {
    return { id, stages: [], ok: true, skipped: true };
  }
  const stages: StageResult[] = [];
  for (const stage of ["fixture", "correct", "stale"] as const) {
    if (stage !== "fixture" && !hasReference(subject, stage)) {
      stages.push({ stage, expected: EXPECTED_PASS[stage], pass: false, met: false, detail: `reference/${stage} is missing` });
      continue;
    }
    const workdir = await prepare(subject);
    try {
      if (stage !== "fixture") await overlayReference(subject, stage, workdir);
      const res = await check(workdir);
      stages.push(judge(stage, res.pass, res.output.trim().split("\n").pop() ?? ""));
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  }
  return { id, stages, ok: stages.every((s) => s.met), skipped: false };
}

export function formatOutcome(o: VerifyOutcome): string {
  if (o.skipped) return `${o.id}\tSKIP (no reference folders)`;
  const parts = o.stages.map((s) => `${s.stage}=${s.pass ? "pass" : "fail"}${s.met ? "" : ` (expected ${s.expected ? "pass" : "fail"})`}`);
  return `${o.id}\t${o.ok ? "OK" : "WRONG"}\t${parts.join(" ")}`;
}

export async function verifySubjects(subjects: LoadedSubject[], config: BenchConfig): Promise<boolean> {
  let allOk = true;
  for (const subject of subjects) {
    const o = await verifySubject(subject, (s) => prepareWorkdir(s, config), (w) => runCheck(subject, w, config));
    out(formatOutcome(o));
    if (!o.ok) {
      allOk = false;
      for (const s of o.stages.filter((x) => !x.met)) out(`  ${s.stage}: ${s.detail}`);
    }
  }
  return allOk;
}
