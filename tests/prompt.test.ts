import { describe, expect, it } from "vitest";
import { DOCS_HINT, buildPrompt } from "../src/prompt.js";

describe("buildPrompt", () => {
  it("adds the docs hint only to the context7 arm when enabled", () => {
    expect(buildPrompt("task", "oneshot", "context7", true)).toContain(DOCS_HINT);
    expect(buildPrompt("task", "oneshot", "baseline", true)).not.toContain(DOCS_HINT);
  });

  it("leaves both arms identical when the hint is off", () => {
    expect(buildPrompt("task", "agentic", "context7", false)).toBe(buildPrompt("task", "agentic", "baseline", false));
  });
});
