# TypeScript SDK essentials

This repo runs the **Strands Agents TypeScript SDK** on Bun. Default every claim
to TS. Confirm any API shape against the mapped doc (see `references/doc-map.md`)
before asserting it — the items below are the orientation, not a substitute for
the official page.

## Package & imports

- Runtime package: **`@strands-agents/sdk`** (scoped npm). The Python package is
  `strands-agents` and must never appear in `packages/`. `@strands/sdk` does not exist.
- Verified import surface:
  - core: `import { Agent, tool } from '@strands-agents/sdk'`
  - vended tools: `import { bash } from '@strands-agents/sdk/vended-tools/bash'`
- Per the docs there are further subpaths (model providers, telemetry, A2A,
  multi-agent). Confirm the **exact** subpath in the relevant API/concept doc
  before importing rather than guessing the path.
- The SDK is "just TypeScript" — it runs on Node.js 20+, **Bun**, and Deno. This
  repo runs TypeScript files in `packages/` directly with Bun and no build step. Use
  `mise exec -- bun run start` for the local Chat UI dev server and
  `mise exec -- bun run start:server` for the AgentCore Runtime adapter.

## Agent API (orientation — verify in the Agent API doc)

- `new Agent(config?)` — no-arg construction is valid and lazily uses Bedrock;
  construction never fails, `invoke()` fails if AWS creds / Bedrock access are
  missing.
- `await agent.invoke(args, options?)` → `AgentResult` (the first arg is
  `InvokeArgs`; a string prompt is the common case). Read output via
  `result.lastMessage` and `agent.messages` — **never** a non-existent
  `result.text` / `result.output`.
- `agent.stream(args, options?)` → async generator of stream events; consume with
  `for await`. Set `printer: false` so the agent does not also write stdout.
- Agents-as-tools: pass an `Agent` in `tools: []`, or
  `agent.asTool({ name, description, preserveContext })`.
- `invoke()`/`stream()` options carry the run-loop guards: `limits: { turns,
  totalTokens, outputTokens }` and `cancelSignal` (e.g. `AbortSignal.timeout(ms)`);
  wire SIGINT to `agent.cancel()` and inspect `result.stopReason`.

## `AgentConfig` (the constructor options you choose among)

`model`, `tools`, `systemPrompt`, `printer`, `sessionManager`, `plugins`,
`structuredOutputSchema`, `traceAttributes`, `toolExecutor`,
`conversationManager`. Common picks:

- `printer: false` for any server / non-TTY context.
- `systemPrompt` to set the role (not a prepended user message).
- `structuredOutputSchema` (a Zod schema) for typed output.
- `toolExecutor: 'sequential'` only when tools have write-then-read ordering.

## Custom tools

- Primary form is the `tool({ name, description, inputSchema, callback })` factory;
  a class extending `FunctionTool` is the documented alternative. **No `@tool`
  decorator** in TS (that is Python).
- `name` matches `^[a-zA-Z0-9_-]+$` (1–64). `description` should state purpose,
  when-to-use, params, output, and limits — terse one-liners hurt model
  selection.
- Prefer a **Zod** `inputSchema` with `.describe()` on every field (runtime
  validation + typed callback input). Use a raw JSON-Schema only when the schema
  is supplied externally — then input arrives as unvalidated `unknown`.
- Read per-request data inside the callback via `context.invocationState`; never
  accept secrets/ids as model-visible tool params.

## Default model & credentials

- Default provider is **Amazon Bedrock** with **Claude Sonnet 4.6**.
- Do **not** bake a model id literal into committed `packages/`. Source it from env
  (`process.env.BEDROCK_MODEL_ID`, `AWS_REGION`, ...). To confirm the live
  default at runtime, read it off a constructed `Agent`'s model config rather than
  trusting any doc/blog literal (model ids in blog snippets drift).
- Bedrock credentials flow through the AWS SDK chain: env vars
  (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_SESSION_TOKEN`), the shared
  credentials file, an **IAM role** (on EC2/ECS/Lambda/AgentCore), or
  `AWS_BEARER_TOKEN_BEDROCK`. Other providers read `process.env.ANTHROPIC_API_KEY`
  / `OPENAI_API_KEY`.

## Dependency ledger (each capability is a deliberate, exact-pinned dep)

The repo is zero-runtime-deps today. Adopting the SDK breaks that posture on
purpose; treat every addition as a decision and pin an exact `x.y.z` (no
`latest` / `^`).

| Capability | npm dep(s) |
| --- | --- |
| The SDK itself | `@strands-agents/sdk` |
| Tool `inputSchema` / `structuredOutputSchema` | `zod` |
| Anthropic / OpenAI providers | `@anthropic-ai/sdk` / `openai` |
| MCP client transports | `@modelcontextprotocol/sdk` |
| A2A (client + server) | `@a2a-js/sdk`, `express` |
| AgentCore runtime client | `@aws-sdk/client-bedrock-agentcore` |
| Tracing (`setupTracer`) | `@opentelemetry/*` peer deps |

## Python-vs-TS divergence (these won't compile / don't exist in TS)

Flag any of these in TS code — they are Python-only:

- `@tool` decorator; `agent.tool.<name>(...)` direct tool calls; loading tools by
  module / file path (TS requires an explicit `tools: []` array of factory tools).
- MCP `tool_filters` / tool-name prefixing.
- `SlidingWindowConversationManager` per-turn knobs and full-Agent summarization
  variants that the TS API does not expose.
- A2A as a Graph node, and the community `workflow`/`swarm`/`graph` *tools*; in TS
  these are first-class multi-agent constructs (or A2A-as-a-tool), not tools.
- `EdgeConditionWithContext` and Python `Workflow`-tool patterns — model the same
  DAG as a `Graph` in TS, or verify TS `Workflow` support via `search_docs` first.
- Python Lambda layer / Python handlers — there is no TS Strands Lambda layer.
