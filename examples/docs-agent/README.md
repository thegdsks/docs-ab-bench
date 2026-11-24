Sponsored by Upstash. I built and tested this myself.

# docs-agent

The smallest example of giving your own [AI SDK](https://ai-sdk.dev) agent a documentation tool backed by [Context7](https://context7.com?utm_source=gagan-deep-singh). The agent is told to look up docs before it answers a library question, so its answer comes from current documentation instead of training data.

The core is about 60 lines:

- `src/search-docs.ts`: the `searchDocs` tool. Plain `fetch` to the Context7 search endpoint, with errors returned as data.
- `src/agent.ts`: a `ToolLoopAgent` with instructions that say to consult docs first.
- `src/cli.ts`: ask a question from the command line, print the answer and the sources used.

The endpoint is documented in the [Context7 API guide](https://context7.com/docs/api-guide?utm_source=gagan-deep-singh). You need a Context7 API key from [context7.com](https://context7.com?utm_source=gagan-deep-singh).

## Setup

```sh
npm install
cp .env.example .env   # then fill in the three values
```

- `CONTEXT7_API_KEY`: your Context7 key.
- `ANTHROPIC_API_KEY`: your Anthropic key.
- `ANTHROPIC_MODEL`: the model id to use.

Optional: `CONTEXT7_MAX_SNIPPETS` (default 5) and `MAX_STEPS` (default 6).

Without `CONTEXT7_API_KEY` the CLI exits with a message and a non-zero code.

## Run

```sh
npm run ask -- "How do I write a route handler in the Next.js App Router?"
```

Example output shape:

```
<the answer>

searchDocs calls: 1
  query: {"query":"route handler app router","library":"Next.js"}
sources: /vercel/next.js
```

## How to read the output

- The answer is the model's final text.
- `searchDocs calls` is how many times the agent consulted docs, and the exact query it sent. Zero means it answered from memory.
- `sources` lists the library ids behind the snippets it received. `none` means no docs came back (no match, rate limit or outage).

## Errors

The tool never throws into the agent loop. It returns `{ ok: false, error }` so the model can say docs were unavailable.

- 404 `no_documentation_found`: returned as `no_documentation_found`.
- 429: waits for `Retry-After` seconds, retries once, then returns `context7_error_429`.
- 503: waits, retries once, then returns `context7_error_503`.

## Test

```sh
npx vitest run
npx tsc --noEmit
```

Tests use a mock model and a mock `fetch`, so they make no network calls.
