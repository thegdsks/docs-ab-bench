import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Arm, DriverName, Mode } from "./config.js";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface Subject {
  id: string;
  library: string;
  libraryId: string;
  versionBefore: string;
  versionAfter: string;
  released?: string;
  role?: "headline" | "control";
  task: string;
  check: string;
  maxSteps: number;
  breakingChanges?: string[];
  sources?: string[];
}

export interface Run {
  subject: string;
  arm: Arm;
  n: number;
  driver: DriverName;
  model: string;
  pass: boolean;
  steps: number;
  toolCalls?: Record<string, number>;
  context7Calls?: number;
  tokens: { input: number; output: number; total: number };
  costUsd?: number | null;
  durationMs: number;
  checkOutput?: string;
  error?: string | null;
  startedAt: string;
  mode: Mode;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Schemas are loaded from the repo root so they stay the single contract.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats.default(ajv);
const validateRunSchema = ajv.compile(readJson(join(REPO_ROOT, "run.schema.json")) as object);
const validateSubjectSchema = ajv.compile(readJson(join(REPO_ROOT, "subject.schema.json")) as object);

function describeErrors(errors: typeof validateRunSchema.errors): string {
  return (errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`).join("; ");
}

export function validateRun(value: unknown): Run {
  if (!validateRunSchema(value)) {
    throw new Error(`run does not match run.schema.json: ${describeErrors(validateRunSchema.errors)}`);
  }
  return value as Run;
}

export function validateSubject(value: unknown): Subject {
  if (!validateSubjectSchema(value)) {
    throw new Error(`subject does not match subject.schema.json: ${describeErrors(validateSubjectSchema.errors)}`);
  }
  return value as Subject;
}
