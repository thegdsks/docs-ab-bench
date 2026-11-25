import { describe, expect, it } from "vitest";
import { DOCS_HINT, buildPrompt, instructionsFile } from "../src/prompt.js";

describe("buildPrompt", () => {
  it("adds the docs hint only to the context7 arm when enabled", () => {
    expect(buildPrompt("task", "oneshot", "context7", true)).toContain(DOCS_HINT);
    expect(buildPrompt("task", "oneshot", "baseline", true)).not.toContain(DOCS_HINT);
  });

  it("leaves both arms identical when the hint is off", () => {
    expect(buildPrompt("task", "agentic", "context7", false)).toBe(buildPrompt("task", "agentic", "baseline", false));
  });
});

describe("hint placement", () => {
  it("keeps the hint out of the prompt and writes it to the instructions file in claude-md placement", () => {
    expect(buildPrompt("task", "oneshot", "context7", true, "claude-md")).not.toContain(DOCS_HINT);
    expect(instructionsFile("context7", true, "claude-md")).toContain(DOCS_HINT);
  });

  it("writes no instructions file for the baseline, the prompt placement or when the hint is off", () => {
    expect(instructionsFile("baseline", true, "claude-md")).toBeUndefined();
    expect(instructionsFile("context7", true, "prompt")).toBeUndefined();
    expect(instructionsFile("context7", false, "claude-md")).toBeUndefined();
  });
});
