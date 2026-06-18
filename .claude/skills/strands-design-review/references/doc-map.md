# Doc map: concern → official Strands doc

The heart of this skill. Jump straight to the right official page instead of
guessing or searching blind, so the `strands` MCP server is used surgically.

## How to use this map

- Each row below abbreviates the call as `fetch_doc <URL>`; the literal invocation
  is always **`mcp__strands__fetch_doc(uri="<URL>")`**. For a large page, fetch the
  TOC first — `mcp__strands__fetch_doc(uri="<URL>")` — then the section you need —
  `mcp__strands__fetch_doc(uri="<URL>", section="N")`.
- The concern is not listed, or a URL 404s? Fall back to
  **`mcp__strands__search_docs(query=<keywords>)`**, then fetch the result whose
  path contains `/typescript/` or `/api/typescript/` (prefer TS over Python).
- These are **public `strandsagents.com` URLs**. When the `strands` MCP server is
  unavailable (e.g. running under Codex, or `uvx` not installed), fetch the same
  URLs with the active web-fetch tool.
- Never assert Strands-specific behavior from memory. URLs here are best-known
  starting points, not guarantees — the docs reorganize.

## Scaffolding & Agent API

- **Scaffold or compare a minimal TS SDK app** —
  `fetch_doc https://strandsagents.com/docs/user-guide/quickstart/typescript/index.md`
  Use for orientation on `@strands-agents/sdk`, ESM, providers, and streaming.
  This repo no longer has a single CLI agent entry point; compare quickstart examples
  against the current AgentCore entry points (`packages/server.ts`, `packages/runtime.ts`,
  `packages/agents.ts`) and local Chat UI server (`packages/chat-ui-dev-server.ts`).
- **`Agent` class surface (constructor, `invoke()`, `stream()`, `asTool()`, accessors)** —
  `fetch_doc https://strandsagents.com/docs/api/typescript/Agent/index.md`
  Verify `await` on `invoke()`, `for await` on `stream()`, and the real
  `AgentResult` accessors (do not invent `result.text`/`result.output`).
- **Full `AgentConfig` option list** —
  `fetch_doc https://strandsagents.com/docs/api/typescript/AgentConfig/index.md`
  `model`, `tools`, `systemPrompt`, `printer`, `sessionManager`, `plugins`,
  `structuredOutputSchema`, `traceAttributes`, `toolExecutor`, `conversationManager`.

## Tools

- **Tools overview (4 categories, attaching, description quality)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/tools/index.md`
  Tool name must match `^[a-zA-Z0-9_-]+$` (1–64 chars); descriptions drive model
  selection.
- **Authoring custom tools (`tool()` factory, Zod vs JSON-Schema, callbacks, `ToolContext`)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/tools/custom-tools/index.md`
  TS has **no `@tool` decorator** — use the `tool()` factory (or a class extending
  `FunctionTool`). Prefer a Zod `inputSchema` for runtime validation + a typed
  callback input.
- **`tool()` API reference (exact signature, the 4 config keys)** —
  `fetch_doc https://strandsagents.com/docs/api/typescript/tool/index.md`
- **MCP tools (`McpClient`, stdio/HTTP/SSE transports, multiple servers)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/tools/mcp-tools/index.md`
  TS passes `McpClient` instances into `tools: []`; **no tool filtering/prefixing**
  (Python-only) — avoid name collisions at the server.
- **Tool executors (concurrent vs sequential, ordering, cancellation)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/tools/executors/index.md`
  Default is concurrent; set `toolExecutor: 'sequential'` only for write-then-read
  dependencies.
- **Vended (pre-built) tools: `fileEditor`, `httpRequest`, `notebook`, `bash`** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/tools/vended-tools/index.md`
  [WARNING] `bash` and `fileEditor` are documented Node/Unix-only — **verify under
  Bun before depending on them.**

## Agent internals

- **Agent loop, stop reasons, limits, cancellation** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/agents/agent-loop/index.md`
  Bound work via `limits: { turns, totalTokens }`; Ctrl-C/timeout via
  `cancelSignal: AbortSignal.timeout(ms)` + `agent.cancel()`.
- **State layers: messages vs `appState` vs `invocationState`** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/agents/state/index.md`
  Model-visible → messages; cross-turn non-model JSON → `appState`; per-request
  ids/secrets → `invocationState`.
- **Conversation management (SlidingWindow default, Summarizing, proactive compression)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/agents/conversation-management/index.md`
  Set `contextWindowLimit` on the model if it is not in the built-in lookup (else
  the 200k fallback misfires proactive compression).
- **Session management (durable persistence, FileStorage vs S3Storage, snapshots)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/agents/session-management/index.md`
  `FileStorage('./sessions')` is zero-infra (gitignore it); `S3Storage` maps to a
  `terraform/aws` bucket + IAM. In multi-agent, attach `sessionManager` to the
  orchestrator only.
- **Structured output (Zod schema → `structuredOutputSchema` → typed result)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/agents/structured-output/index.md`
  Wrap `invoke()` in try/catch for `StructuredOutputError`; `.describe()` fields.
  Makes `zod` a runtime dep.
- **Hooks & plugins (logging, metrics, retries, guardrails)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/agents/hooks/index.md`
  `addHook(EventClass, cb, { order })`; Plugins implement `Plugin.initAgent`.
  After-events run in reverse registration order.
- **System prompts & multi-modal messages (`TextBlock`/`ImageBlock`)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/agents/prompts/index.md`
  Set the role via `systemPrompt`, not a prepended user message. Direct tool calls
  are Python-only.

## Multi-agent

- **Pattern selection (Graph vs Swarm vs Workflow) — READ FIRST** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/multi-agent/multi-agent-patterns/index.md`
  Decision axis = how the execution path is determined.
- **Agents-as-tools (hierarchical orchestrator, lowest friction, fully GA in TS)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/multi-agent/agents-as-tools/index.md`
  Pass an `Agent` in `tools: []` or `agent.asTool({ name, description, preserveContext })`.
  Sub-agents need `name` + `description` and `printer: false`; context **resets**
  per call by default.
- **Swarm (autonomous handoffs)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/multi-agent/swarm/index.md`
  **Always set `maxSteps`/`timeout` in TS** (else unbounded). Each agent needs
  `id` + `description`. A2A is not supported inside a Swarm.
- **Graph (developer-defined flow, conditional edges, cycles)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/multi-agent/graph/index.md`
  TS uses **AND** join semantics (Python uses OR); set `maxSteps` for cyclic
  graphs; `preserveContext: true` for revisited stateful nodes.
- **Agent-to-Agent / A2A (cross-process, `A2AAgent` client + `A2AExpressServer`)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/multi-agent/agent-to-agent/index.md`
  Adds `@a2a-js/sdk` + `express`. Use `agentFactory` (per-`contextId`), not the
  deprecated single agent; `contextId` is **not** an auth boundary.

## Model providers

- **Provider matrix (which providers TS supports + swap pattern)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/model-providers/index.md`
  TS-supported: Bedrock, Anthropic, OpenAI, Google, Vercel, Custom. Many others
  (Ollama, LiteLLM, Nova, SageMaker, ...) are Python-only.
- **Amazon Bedrock (default provider)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/concepts/model-providers/amazon-bedrock/index.md`
  Default model is Claude Sonnet 4.6. Credentials, region, `guardrailConfig` (TS
  nests `redaction.{input,output}`; **output redaction defaults OFF**).
- **`BedrockModelOptions` API reference (exhaustive option list)** —
  `fetch_doc https://strandsagents.com/docs/api/typescript/BedrockModelOptions/index.md`
  `modelId`, `region`, `stream`, `maxTokens`, `cacheConfig`,
  `clientConfig.requestHandler.requestTimeout`, `guardrailConfig`.

## Deployment & infra (informs `terraform/`)

- **AgentCore TS deployment (primary AWS path)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/deploy/deploy_to_bedrock_agentcore/typescript/index.md`
  `/invocations` receives a **binary** payload: `express.raw({ type: '*/*' })` +
  `TextDecoder`; bind `0.0.0.0:8080`; ARM64 image.
- **Multi-cloud Terraform HCL (App Runner / Lambda / Cloud Run / Azure)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/deploy/deploy_to_terraform/index.md`
  The only literal HCL Strands ships for both clouds. On AWS, Bedrock creds are
  free via IAM; on Cloud Run/Azure they must be injected as tfvars.
- **Production hardening checklist** —
  `fetch_doc https://strandsagents.com/docs/user-guide/deploy/operating-agents-in-production/index.md`
  Explicit `tools: []` (no auto-loading), explicit model params, conversation
  manager, observability.
- **Docker TS containerization foundation** —
  `fetch_doc https://strandsagents.com/docs/user-guide/deploy/deploy_to_docker/typescript/index.md`
  [WARNING] Docs use `node:20` + npm + `tsc`; a Bun base image is untested by the
  docs, and the docs' "Test Locally" block wrongly says `uv run python`.

## Safety & observability

- **Bedrock guardrails (enforce vs shadow mode, non-Bedrock fallback)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/safety-security/guardrails/index.md`
  Non-Bedrock providers have no native guardrail — fall back to prompt engineering
  + custom pre/post filtering. **PII redaction is not native to the SDK.**
- **Traces (`setupTracer()`, OTEL peer deps, X-Ray export)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/observability-evaluation/traces/index.md`
  `setupTracer` from `@strands-agents/sdk/telemetry` needs `@opentelemetry/*` peer
  deps (verify `sdk-trace-node` under Bun); exclude PII from `traceAttributes`.
- **Metrics (`result.metrics` — token usage, tool metrics, duration)** —
  `fetch_doc https://strandsagents.com/docs/user-guide/observability-evaluation/metrics/index.md`

## Fallback (anything not mapped above)

- Memory manager, evaluation/evals-sdk, a brand-new feature, etc. —
  `mcp__strands__search_docs(query=<keywords>)`, then `fetch_doc` the best
  `/typescript/` or `/api/typescript/` result. Never answer from memory.
