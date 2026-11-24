// Single place that writes to the terminal so source never calls console directly.
export function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function warn(line: string): void {
  process.stderr.write(`${line}\n`);
}
