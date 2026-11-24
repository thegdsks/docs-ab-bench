import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, "..", "run.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const dir = join(here, "fixtures", "sample");
// manifest.json lists files for the static page, it is not a run.
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "manifest.json");
let bad = 0;
for (const f of files) {
  const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
  if (!validate(data)) {
    bad += 1;
    process.stderr.write(`${f}: ${ajv.errorsText(validate.errors)}\n`);
  }
}
process.stdout.write(`${files.length - bad}/${files.length} fixtures valid\n`);
process.exit(bad ? 1 : 0);
