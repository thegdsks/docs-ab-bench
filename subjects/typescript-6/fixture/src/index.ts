import { join } from "node:path";
import { readFileSync } from "node:fs";
import { formatRow, Row } from "./format";

const file = join(__dirname, "..", "data", "scores.json");
const rows: Row[] = JSON.parse(readFileSync(file, "utf8"));

for (const row of rows) {
  console.log(formatRow(row));
}
process.exit(0);
