import type { Arm, Mode } from "./config.js";

// With the hint on, the docs arm is told to use its tool, which is how the vendor recommends using it.
export const DOCS_HINT =
  "Before you write code, use the Context7 tools to look up the current documentation for the libraries involved.";

export function buildPrompt(taskText: string, mode: Mode, arm: Arm, docsHint: boolean): string {
  const modeLine =
    mode === "oneshot"
      ? "You can read, write and list files only. You cannot run commands, so get it right in one pass."
      : "You can read, write and list files and run commands such as npm and node to test your work.";
  const hint = arm === "context7" && docsHint ? `\n${DOCS_HINT}` : "";
  return `${taskText}\n\n${modeLine}${hint}\nWork in the current project folder and stop when the task is done.`;
}

export const SYSTEM_INSTRUCTIONS =
  "You are a coding agent working in a small project folder. Make the requested change by editing files.";
