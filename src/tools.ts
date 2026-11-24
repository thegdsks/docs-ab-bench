import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { searchDocs, type DocsClient } from "./docs.js";
import { execCapture, parseShellCommand, resolveInWorkdir, truncate } from "./sandbox.js";

export interface ToolOptions {
  workdir: string;
  agentic: boolean;
  shellAllow: string[];
  shellTimeoutMs: number;
  maxOutputChars: number;
  docs?: DocsClient;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Tool errors go back to the model as text so one bad path does not end the run.
export function buildTools(opts: ToolOptions): ToolSet {
  const tools: ToolSet = {
    readFile: tool({
      description: "Read a UTF-8 text file. Path is relative to the project root.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        try {
          const text = await readFile(resolveInWorkdir(opts.workdir, path), "utf8");
          return truncate(text, opts.maxOutputChars);
        } catch (err) {
          return `ERROR: ${message(err)}`;
        }
      },
    }),
    writeFile: tool({
      description: "Create or overwrite a UTF-8 text file. Parent folders are created. Path is relative to the project root.",
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        try {
          const target = resolveInWorkdir(opts.workdir, path);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, content, "utf8");
          return `wrote ${content.length} chars to ${path}`;
        } catch (err) {
          return `ERROR: ${message(err)}`;
        }
      },
    }),
    listDir: tool({
      description: "List entries of a folder. Path is relative to the project root, use . for the root.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        try {
          const entries = await readdir(resolveInWorkdir(opts.workdir, path), { withFileTypes: true });
          return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join("\n");
        } catch (err) {
          return `ERROR: ${message(err)}`;
        }
      },
    }),
  };

  if (opts.agentic) {
    tools["runShell"] = tool({
      description: `Run one plain command in the project root. Allowed programs: ${opts.shellAllow.join(", ")}. No pipes, redirects or chaining.`,
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        try {
          const { bin, args } = parseShellCommand(command, opts.workdir, opts.shellAllow);
          const res = await execCapture(bin, args, { cwd: opts.workdir, timeoutMs: opts.shellTimeoutMs });
          const head = res.timedOut ? "TIMED OUT\n" : `exit ${res.code}\n`;
          return truncate(head + res.output, opts.maxOutputChars);
        } catch (err) {
          return `ERROR: ${message(err)}`;
        }
      },
    });
  }

  const docs = opts.docs;
  if (docs) {
    tools["searchDocs"] = tool({
      description: `Search current documentation for the library used in this project (${docs.libraryId}). Ask a specific question.`,
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        try {
          return await searchDocs(docs, query);
        } catch (err) {
          return `ERROR: ${message(err)}`;
        }
      },
    });
  }

  return tools;
}
