import type { Arm, HintPlacement, Mode } from "./config.js";

// With the hint on, the docs arm is told to use its tool, which is how the vendor recommends using it.
export const DOCS_HINT =
  "Before you write code, use the Context7 tools to look up the current documentation for the libraries involved.";

// In claude-md placement the same line lives in the project instructions file instead of the prompt.
export function instructionsFile(arm: Arm, docsHint: boolean, placement: HintPlacement): string | undefined {
  if (arm !== "context7" || !docsHint || placement !== "claude-md") return undefined;
  return `# Project instructions\n\n${DOCS_HINT}\n`;
}

export function buildPrompt(
  taskText: string,
  mode: Mode,
  arm: Arm,
  docsHint: boolean,
  placement: HintPlacement = "prompt",
): string {
  const modeLine =
    mode === "oneshot"
      ? "You can read, write and list files only. You cannot run commands, so get it right in one pass."
      : "You can read, write and list files and run commands such as npm and node to test your work.";
  const hint = arm === "context7" && docsHint && placement === "prompt" ? `\n${DOCS_HINT}` : "";
  return `${taskText}\n\n${modeLine}${hint}\nWork in the current project folder and stop when the task is done.`;
}

export const SYSTEM_INSTRUCTIONS =
  "You are a coding agent working in a small project folder. Make the requested change by editing files.";
