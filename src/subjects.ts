import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, validateSubject, type Subject } from "./schema.js";

export interface LoadedSubject {
  subject: Subject;
  dir: string;
  taskText: string;
  checkPath: string;
  fixtureDir: string;
}

export function subjectsRoot(root: string = REPO_ROOT): string {
  return join(root, "subjects");
}

export function listSubjectIds(root: string = REPO_ROOT): string[] {
  const dir = subjectsRoot(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "subject.json")))
    .map((d) => d.name)
    .sort();
}

export function loadSubject(id: string, root: string = REPO_ROOT): LoadedSubject {
  const dir = join(subjectsRoot(root), id);
  const file = join(dir, "subject.json");
  if (!existsSync(file)) throw new Error(`unknown subject "${id}" (no ${file})`);
  const subject = validateSubject(JSON.parse(readFileSync(file, "utf8")));
  if (subject.id !== id) throw new Error(`subject.json id "${subject.id}" does not match folder "${id}"`);
  const taskPath = join(dir, subject.task);
  if (!existsSync(taskPath)) throw new Error(`subject ${id}: task file missing at ${taskPath}`);
  const checkPath = join(dir, subject.check);
  if (!existsSync(checkPath)) throw new Error(`subject ${id}: check script missing at ${checkPath}`);
  const fixtureDir = join(dir, "fixture");
  if (!existsSync(fixtureDir)) throw new Error(`subject ${id}: fixture folder missing at ${fixtureDir}`);
  return { subject, dir, taskText: readFileSync(taskPath, "utf8").trim(), checkPath, fixtureDir };
}

export function resolveSubjectIds(selector: string, root: string = REPO_ROOT): string[] {
  if (selector === "all") return listSubjectIds(root);
  return selector.split(",").map((s) => s.trim()).filter(Boolean);
}
