import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseShellCommand, resolveInWorkdir } from "../src/sandbox.js";
import { buildTools } from "../src/tools.js";

function workdir(): string {
  return mkdtempSync(join(tmpdir(), "bench-test-"));
}

describe("sandbox", () => {
  it("accepts paths inside the workdir", () => {
    const dir = workdir();
    expect(resolveInWorkdir(dir, "a/b.txt").endsWith("a/b.txt")).toBe(true);
    expect(() => resolveInWorkdir(dir, ".")).not.toThrow();
  });

  it("rejects parent traversal and absolute paths outside", () => {
    const dir = workdir();
    expect(() => resolveInWorkdir(dir, "../x")).toThrow(/escapes/);
    expect(() => resolveInWorkdir(dir, "a/../../x")).toThrow(/escapes/);
    expect(() => resolveInWorkdir(dir, "/etc/passwd")).toThrow(/escapes/);
  });

  it("rejects a symlink that points outside", () => {
    const dir = workdir();
    const outside = workdir();
    writeFileSync(join(outside, "secret.txt"), "s");
    symlinkSync(outside, join(dir, "link"));
    expect(() => resolveInWorkdir(dir, "link/secret.txt")).toThrow(/escapes/);
    expect(() => resolveInWorkdir(dir, "link/new.txt")).toThrow(/escapes/);
  });

  it("file tools return an error instead of leaking outside files", async () => {
    const dir = workdir();
    const tools = buildTools({ workdir: dir, agentic: false, shellAllow: [], shellTimeoutMs: 1000, maxOutputChars: 1000 });
    type Exec = (args: { path: string }, opts: { toolCallId: string; messages: never[] }) => Promise<unknown>;
    const execute = tools["readFile"]?.execute as unknown as Exec;
    const res = await execute({ path: "../../etc/hosts" }, { toolCallId: "t", messages: [] });
    expect(String(res)).toMatch(/ERROR: path escapes/);
    expect(tools["runShell"]).toBeUndefined();
    expect(tools["searchDocs"]).toBeUndefined();
  });

  it("allow-lists shell commands and blocks metacharacters and outside paths", () => {
    const dir = workdir();
    mkdirSync(join(dir, "sub"));
    const allow = ["npm", "ls", "cat"];
    expect(parseShellCommand("ls sub", dir, allow)).toEqual({ bin: "ls", args: ["sub"] });
    expect(() => parseShellCommand("curl http://x", dir, allow)).toThrow(/not allowed/);
    expect(() => parseShellCommand("ls; rm -rf /", dir, allow)).toThrow(/metacharacters/);
    expect(() => parseShellCommand("cat a | sh", dir, allow)).toThrow(/metacharacters/);
    expect(() => parseShellCommand("cat /etc/passwd", dir, allow)).toThrow(/escapes/);
    expect(() => parseShellCommand("cat ../x", dir, allow)).toThrow(/escapes/);
  });
});
