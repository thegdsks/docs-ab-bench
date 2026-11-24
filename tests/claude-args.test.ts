import { describe, expect, it } from "vitest";
import { buildArgs } from "../src/drivers/claude-code.js";
import type { DriverInput } from "../src/drivers/types.js";

const base = { arm: "baseline", model: "m", config: { context7ApiKey: undefined } } as unknown as DriverInput;

describe("buildArgs", () => {
  it("gives the shell only in agentic mode, and only inside the sandbox", () => {
    const agentic = buildArgs({ ...base, mode: "agentic" });
    expect(agentic).toContain("--settings");
    expect(agentic.join(" ")).toContain('"enabled":true');
    expect(buildArgs({ ...base, mode: "oneshot" })).not.toContain("--settings");
  });

  it("never bypasses permissions", () => {
    expect(buildArgs({ ...base, mode: "agentic" }).join(" ")).not.toContain("bypassPermissions");
  });
});
