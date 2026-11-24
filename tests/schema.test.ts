import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeRun } from "../src/runner.js";
import { validateRun, validateSubject } from "../src/schema.js";
import { loadSubject } from "../src/subjects.js";
import { makeRun } from "./helpers.js";

describe("run schema", () => {
  it("accepts a valid run and writes it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-test-"));
    const path = join(dir, "toy-hello-baseline-1.json");
    await writeRun(path, makeRun({ costUsd: null, error: null, toolCalls: { writeFile: 1 }, context7Calls: 0 }));
    const back = validateRun(JSON.parse(readFileSync(path, "utf8")));
    expect(back.subject).toBe("toy-hello");
  });

  it("refuses to write an invalid run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bench-test-"));
    const path = join(dir, "bad.json");
    const bad = { ...makeRun(), arm: "other" } as unknown as ReturnType<typeof makeRun>;
    await expect(writeRun(path, bad)).rejects.toThrow(/run.schema.json/);
    expect(existsSync(path)).toBe(false);
  });

  it("rejects a missing required field and a bad date", () => {
    const { tokens: _tokens, ...noTokens } = makeRun();
    expect(() => validateRun(noTokens)).toThrow();
    expect(() => validateRun({ ...makeRun(), startedAt: "yesterday" })).toThrow();
  });

  it("loads the toy subject against subject.schema.json", () => {
    const loaded = loadSubject("toy-hello");
    expect(validateSubject(loaded.subject).id).toBe("toy-hello");
    expect(() => validateSubject({ id: "Bad Id" })).toThrow();
  });
});
