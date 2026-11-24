import { createAgent } from "./agent.js";
import type { SearchDocsResult } from "./search-docs.js";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const question = process.argv.slice(2).join(" ");
if (!question) fail('Usage: npm run ask -- "your question"');

const apiKey = process.env.CONTEXT7_API_KEY;
if (!apiKey) fail("CONTEXT7_API_KEY is not set. Copy .env.example to .env and fill it in.");
if (!process.env.ANTHROPIC_API_KEY) fail("ANTHROPIC_API_KEY is not set.");
if (!process.env.ANTHROPIC_MODEL) fail("ANTHROPIC_MODEL is not set (a model id).");

const result = await createAgent({ search: { apiKey } }).generate({ prompt: question });

const calls = result.steps.flatMap((s) => s.toolCalls);
const sources = result.steps
  .flatMap((s) => s.toolResults)
  .flatMap((r) => ((r.output as SearchDocsResult).ok ? (r.output as SearchDocsResult & { ok: true }).sources : []));

process.stdout.write(`${result.text}\n\n`);
process.stdout.write(`searchDocs calls: ${calls.length}\n`);
for (const c of calls) process.stdout.write(`  query: ${JSON.stringify(c.input)}\n`);
process.stdout.write(`sources: ${[...new Set(sources)].join(", ") || "none"}\n`);
