# Design checklist + pattern selection

Use when **designing** new Strands work in `packages/` or `terraform/`. Confirm each
Strands-specific claim against the mapped doc (`references/doc-map.md`) first.

## Design checklist

- [ ] **TS SDK targeted.** Imports come from `@strands-agents/sdk` (or documented
  subpaths) — never the Python `strands-agents` or an invented `@strands/sdk`.
- [ ] **Docs consulted, not memory.** Before any Strands-specific claim, fetch the
  mapped doc via `mcp__strands__fetch_doc <url>` (or `search_docs` if unmapped).
  If neither MCP nor web docs are reachable, state the blocker and do not present
  behavior as verified.
- [ ] **Model from env.** Default Bedrock + Sonnet 4.6 via `new Agent()`; model id
  and region come from `process.env`, never a committed literal. Confirm the
  target account/region has Bedrock model access (or pass an explicit
  `BedrockModel`).
- [ ] **Model-driven.** Explicit `tools: [...]`, rich tool descriptions for
  selection, no ad hoc hardcoded orchestration unless docs/requirements justify it.
- [ ] **Context layering.** Model-visible → messages; cross-turn non-model JSON →
  `appState`; per-request ids/secrets → `invocationState`. No request metadata
  leaking into messages.
- [ ] **Bounded run loop.** `limits: { turns, totalTokens }` + a `cancelSignal`
  (`AbortSignal.timeout`) for any non-trivial invocation; SIGINT → `agent.cancel()`;
  inspect `result.stopReason`.
- [ ] **Right multi-agent pattern** (see selection guide below); avoid Python-only
  paths.
- [ ] **Right tool kind:** vended (if it covers files/HTTP/shell — but verify
  `bash`/`fileEditor` under Bun) vs MCP client (external server, one per server) vs
  custom `tool()`.
- [ ] **Credentials/config external.** AWS via IAM role/env; API keys via
  `process.env`; guardrail/KB/Memory/model ids via env or Terraform vars. `packages/`
  vs `terraform/{aws,gc}` split preserved.
- [ ] **Deps justified + pinned.** Every new runtime dep (SDK, `zod`, providers,
  MCP transport, A2A/express, AgentCore client, OTEL peers) is deliberate and
  pinned exact (`x.y.z`).
- [ ] **Deploy shape.** Service exposes `GET /ping` + `POST /invocations` on
  `0.0.0.0:port` (8080 AgentCore/App Runner, `$PORT` Cloud Run); AgentCore
  `/invocations` uses `express.raw` + `TextDecoder` (binary), ARM64 image where
  required.
- [ ] **Safety/observability decided.** Guardrails (Bedrock `guardrailConfig`,
  output redaction defaults OFF) or a non-Bedrock fallback; the SDK does **not**
  redact PII natively; PII excluded from `traceAttributes`.

## Pattern selection guide

**Single vs multi-agent** — Start with ONE `Agent` + custom tools. Go multi-agent
only when the task genuinely splits into distinct specialist roles or needs
branching/loops. For a PoC, a single agent with explicit tools is almost always
the right first answer.

**Among multi-agent options** (decision axis = how the execution path is
determined):

- **Agents-as-tools** — the orchestrator's LLM picks a specialist per call.
  Hierarchical, lowest friction, fully GA in TS, zero extra deps. **Use this
  first.**
- **Graph** — a developer-defined flowchart the LLM routes through; supports
  conditional edges + cycles. TS uses AND-join semantics; set `maxSteps` for
  cycles.
- **Swarm** — agents autonomously hand off to peers (emergent path). **Must** be
  bounded with `maxSteps`/`timeout` in TS.
- **Workflow** (fixed non-conversational DAG as one tool) is documented
  Python-side — in TS, verify support via `search_docs` first, otherwise model the
  same DAG as a **Graph**.
- **A2A** for cross-process / cross-runtime (e.g. a `terraform/gc` agent talking
  to a `terraform/aws` agent, or exposing a service): `A2AAgent` client +
  `A2AExpressServer`. Supported only as-a-tool in TS (not in Swarm, not as a Graph
  node). Adds `@a2a-js/sdk` + `express`.

**Custom tool vs vended tool** — If the need is files/HTTP/shell/notebook, check
vended tools FIRST, but `bash` and `fileEditor` are Node/Unix-only (verify under
Bun); `httpRequest`/`notebook` target Node 20+/browsers. Otherwise author a custom
`tool()` with a Zod schema.

**Custom tool vs MCP tool** — Custom `tool()` for in-process logic you own; an
`McpClient` when the capability lives in an external MCP server. One `McpClient`
per server; TS has no tool filtering/prefixing, so avoid cross-server name
collisions at the server level.

**Zod vs JSON-Schema `inputSchema`** — Default to Zod (runtime validation + typed
callback input, no casts). Use raw JSON-Schema only when the schema is supplied
externally, and accept that input arrives as unvalidated `unknown`.

**`invoke()` vs `stream()`** — `invoke()` for one-shot CLI/request-response
(returns final `AgentResult`); `stream()` (async generator) for TTY/server
streaming, with `printer: false`.

**Conversation manager** — Default SlidingWindow is fine for short PoC sessions;
switch to Summarizing (with a cheaper summary model) + proactive compression for
long/cost-sensitive sessions, and set `contextWindowLimit` if the model is not in
the built-in lookup.

**Sessions** — Omit `sessionManager` for a stateless CLI PoC; `FileStorage('./sessions')`
for zero-infra persistence (gitignore it); `S3Storage` when distributed/durable
(maps to a `terraform/aws` bucket + IAM). In multi-agent, attach `sessionManager`
to the orchestrator only.

**Deploy target** — AgentCore (TS-native, serverless, simplest IAM) for a PoC;
Fargate only for streaming/high-concurrency; Lambda only for cheapest/no-streaming.
On non-AWS (Cloud Run) prefer a GCP-native provider to avoid injecting AWS keys.

**Guardrails** — Bedrock `guardrailConfig` (native) when on Bedrock; for
non-Bedrock providers there is no native guardrail — fall back to prompt
engineering + custom pre/post filtering. PII redaction is always the integrator's
job.
