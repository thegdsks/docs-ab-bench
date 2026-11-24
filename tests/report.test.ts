import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { median, report, summarize } from "../src/report.js";
import { makeRun } from "./helpers.js";

describe("report math", () => {
  it("computes median for odd and even counts", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  it("summarizes arms and deltas per subject and mode", () => {
    const runs = [
      makeRun({ arm: "baseline", n: 1, pass: true, steps: 4, tokens: { input: 90, output: 10, total: 100 }, durationMs: 1000 }),
      makeRun({ arm: "baseline", n: 2, pass: false, steps: 6, tokens: { input: 280, output: 20, total: 300 }, durationMs: 3000 }),
      makeRun({ arm: "context7", n: 1, pass: true, steps: 3, tokens: { input: 180, output: 20, total: 200 }, durationMs: 2000, context7Calls: 2 }),
      makeRun({ arm: "context7", n: 2, pass: true, steps: 5, tokens: { input: 380, output: 20, total: 400 }, durationMs: 4000, context7Calls: 4 }),
      makeRun({ mode: "agentic", arm: "baseline", tokens: { input: 5, output: 5, total: 10 } }),
    ];
    const s = summarize("b", runs);
    const one = s.subjects["toy-hello"]?.["oneshot"];
    expect(one?.baseline).toEqual({
      runs: 2,
      passRate: 0.5,
      tokensMean: 200,
      tokensMedian: 200,
      stepsMean: 5,
      durationMsMean: 2000,
      context7CallsMean: 0,
    });
    expect(one?.context7?.passRate).toBe(1);
    expect(one?.context7?.tokensMean).toBe(300);
    expect(one?.context7?.context7CallsMean).toBe(3);
    expect(one?.delta).toEqual({
      passRate: 0.5,
      tokensMean: 100,
      tokensMedian: 100,
      stepsMean: -1,
      durationMsMean: 1000,
      context7CallsMean: 3,
    });
    const agentic = s.subjects["toy-hello"]?.["agentic"];
    expect(agentic?.context7).toBeNull();
    expect(agentic?.delta).toBeNull();
  });

  it("reads run files from disk, skips invalid ones and writes summary.json", () => {
    const root = mkdtempSync(join(tmpdir(), "bench-test-"));
    const dir = join(root, "runs", "b1");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "toy-hello-baseline-1.json"), JSON.stringify(makeRun()));
    writeFileSync(join(dir, "toy-hello-context7-1.json"), JSON.stringify(makeRun({ arm: "context7", tokens: { input: 40, output: 10, total: 50 } })));
    writeFileSync(join(dir, "broken.json"), "{not json");
    const s = report("b1", root);
    expect(s.totalRuns).toBe(2);
    const written = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) as typeof s;
    expect(written.subjects["toy-hello"]?.["oneshot"]?.delta?.tokensMean).toBe(-50);
  });
});
