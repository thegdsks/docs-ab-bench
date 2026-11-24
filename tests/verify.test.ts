import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LoadedSubject } from "../src/subjects.js";
import { formatOutcome, judge, overlayReference, verifySubject } from "../src/verify.js";

function fakeSubject(refs: Record<string, Record<string, string>>): LoadedSubject {
  const dir = mkdtempSync(join(tmpdir(), "verify-subject-"));
  mkdirSync(join(dir, "fixture"));
  writeFileSync(join(dir, "fixture", "answer.txt"), "none\n");
  for (const [name, files] of Object.entries(refs)) {
    mkdirSync(join(dir, "reference", name), { recursive: true });
    for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, "reference", name, file), text);
  }
  return {
    subject: { id: "fake" } as LoadedSubject["subject"],
    dir,
    taskText: "",
    checkPath: join(dir, "check.sh"),
    fixtureDir: join(dir, "fixture"),
  };
}

function prepareFrom(subject: LoadedSubject) {
  return async (): Promise<string> => {
    const work = mkdtempSync(join(tmpdir(), "verify-work-"));
    writeFileSync(join(work, "answer.txt"), readFileSync(join(subject.fixtureDir, "answer.txt")));
    writeFileSync(join(work, "keep.txt"), "kept\n");
    return work;
  };
}

// Fake check: passes only when answer.txt says "right".
const check = async (work: string) => {
  const pass = readFileSync(join(work, "answer.txt"), "utf8").trim() === "right";
  return { pass, output: `line one\n${pass ? "ok" : "bad"}` };
};

describe("overlayReference", () => {
  it("copies reference files over the workdir and keeps the rest", async () => {
    const s = fakeSubject({ correct: { "answer.txt": "right\n", "extra.txt": "x\n" } });
    const work = await prepareFrom(s)();
    await overlayReference(s, "correct", work);
    expect(readFileSync(join(work, "answer.txt"), "utf8")).toBe("right\n");
    expect(existsSync(join(work, "extra.txt"))).toBe(true);
    expect(readFileSync(join(work, "keep.txt"), "utf8")).toBe("kept\n");
  });

  it("throws for a missing reference", async () => {
    const s = fakeSubject({});
    await expect(overlayReference(s, "stale", await prepareFrom(s)())).rejects.toThrow(/missing/);
  });
});

describe("judge", () => {
  it("expects fixture and stale to fail and correct to pass", () => {
    expect(judge("fixture", false, "").met).toBe(true);
    expect(judge("fixture", true, "").met).toBe(false);
    expect(judge("correct", true, "").met).toBe(true);
    expect(judge("correct", false, "").met).toBe(false);
    expect(judge("stale", false, "").met).toBe(true);
    expect(judge("stale", true, "").met).toBe(false);
  });
});

describe("verifySubject", () => {
  it("is ok when all three expectations are met", async () => {
    const s = fakeSubject({ correct: { "answer.txt": "right\n" }, stale: { "answer.txt": "old\n" } });
    const o = await verifySubject(s, prepareFrom(s), check);
    expect(o.ok).toBe(true);
    expect(formatOutcome(o)).toBe("fake\tOK\tfixture=fail correct=pass stale=fail");
  });

  it("flags a stale reference that passes", async () => {
    const s = fakeSubject({ correct: { "answer.txt": "right\n" }, stale: { "answer.txt": "right\n" } });
    const o = await verifySubject(s, prepareFrom(s), check);
    expect(o.ok).toBe(false);
    expect(formatOutcome(o)).toContain("stale=pass (expected fail)");
  });

  it("flags a correct reference that fails", async () => {
    const s = fakeSubject({ correct: { "answer.txt": "wrong\n" }, stale: { "answer.txt": "old\n" } });
    expect((await verifySubject(s, prepareFrom(s), check)).ok).toBe(false);
  });

  it("flags a missing reference folder", async () => {
    const s = fakeSubject({ correct: { "answer.txt": "right\n" } });
    const o = await verifySubject(s, prepareFrom(s), check);
    expect(o.ok).toBe(false);
    expect(o.stages[2]?.detail).toMatch(/missing/);
  });

  it("skips a subject with no reference folders", async () => {
    const s = fakeSubject({});
    const o = await verifySubject(s, prepareFrom(s), check);
    expect(o.skipped).toBe(true);
    expect(o.ok).toBe(true);
  });
});
