import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Driver } from "../src/drivers/types.js";
import { runOne } from "../src/runner.js";
import { validateRun } from "../src/schema.js";
import { loadSubject } from "../src/subjects.js";
import { testConfig } from "./helpers.js";

const ok = { steps: 1, toolCalls: {}, context7Calls: 0, tokens: { input: 1, output: 1, total: 2 }, costUsd: null, error: null };

describe("runner", () => {
  it("runs the toy subject end to end and writes a valid run file", async () => {
    const root = mkdtempSync(join(tmpdir(), "bench-test-"));
    const driver: Driver = async ({ workdir }) => {
      writeFileSync(join(workdir, "hello.txt"), "hello\n");
      return ok;
    };
    const { run, path } = await runOne({
      subject: loadSubject("toy-hello"),
      arm: "baseline",
      n: 1,
      mode: "oneshot",
      driverName: "ai-sdk",
      driver,
      model: "test-model",
      config: testConfig(),
      batch: "t",
      root,
    });
    expect(run.pass).toBe(true);
    expect(path).toBe(join(root, "runs", "t", "toy-hello-baseline-1.json"));
    expect(validateRun(JSON.parse(readFileSync(path, "utf8"))).pass).toBe(true);
  });

  it("records pass false when the check fails and keeps the driver error", async () => {
    const root = mkdtempSync(join(tmpdir(), "bench-test-"));
    const driver: Driver = async () => ({ ...ok, error: "boom" });
    const { run } = await runOne({
      subject: loadSubject("toy-hello"),
      arm: "context7",
      n: 2,
      mode: "agentic",
      driverName: "claude-code",
      driver,
      model: "test-model",
      config: testConfig(),
      batch: "t",
      root,
    });
    expect(run.pass).toBe(false);
    expect(run.error).toBe("boom");
  });
});
