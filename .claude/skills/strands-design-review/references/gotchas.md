# Gotchas

A fast cross-cutting scan for both design and review — the traps that the concept
docs scatter and that are easy to get wrong.

## SDK & language

- **Python-only APIs in a TS repo.** `@tool` decorator, `agent.tool.<name>(...)`
  direct calls, module/file-path tool loading, MCP `tool_filters`/prefixing,
  `Workflow`-as-tool, A2A-as-a-graph-node, `EdgeConditionWithContext`, community
  `swarm`/`graph`/`workflow` tools, the Python Lambda layer. None compile/exist in
  TS — see `references/typescript-sdk.md` for the full divergence list.
- **`@strands/sdk` does not exist.** The package is `@strands-agents/sdk`;
  `strands-agents` is the Python distribution.
- **`printer` defaults to `true`** — agents write to stdout unless you set
  `printer: false`. Wrong for servers and when you also consume `stream()`.
- **Output accessor.** Read `AgentResult` via its documented accessors /
  `agent.messages`; there is no `result.text` / `result.output`.

## Model & context

- **Model ids drift.** Treat any model id in a blog/doc snippet as illustrative.
  Don't bake one into the skill or committed `packages/`; read the live default off a
  constructed `Agent` and source ids from env.
- **`proactiveCompression` 200k fallback.** If the model isn't in the built-in
  context-window lookup, set `contextWindowLimit` explicitly or compression
  misfires at a wrong 200k assumption.

## Tools & runtime

- **Vended `bash`/`fileEditor` are Node/Unix-only.** Bun support is not asserted —
  verify before depending. `httpRequest`/`notebook` target Node 20+/browsers.
- **Default tool execution is concurrent.** Use `toolExecutor: 'sequential'` for
  write-then-read ordering.

## Safety & observability

- **Output redaction defaults OFF** in Bedrock `guardrailConfig` (TS nests
  `redaction.{input,output}`).
- **No native PII redaction.** The SDK never redacts PII for you — it's the
  integrator's job (a third-party lib or an OTEL-collector processor). Keep PII out
  of `traceAttributes`.
- **OTEL under Bun is unverified.** `setupTracer()` needs `@opentelemetry/*` peer
  deps; the docs use `sdk-trace-node` (NodeTracerProvider) — confirm under Bun.

## Deployment

- **AgentCore `/invocations` is a binary payload** — `express.raw({ type: '*/*' })`
  + `TextDecoder`, bound to `0.0.0.0:8080`.
- **Architecture mismatch is a silent failure.** AgentCore + the Fargate example
  are ARM64; the Terraform Lambda example is x86_64. Keep Dockerfile `--platform`,
  Terraform `architectures`, and installs on one arch.
- **The docs' Docker path is Node 20 + npm + `tsc`** — a Bun base image is
  untested, and the docs' "Test Locally" block wrongly says `uv run python`.
- **Cross-cloud keys footgun.** Bedrock from Cloud Run needs AWS keys as
  `sensitive` tfvars; prefer a GCP-native provider instead.
- **GCP/Bun-container is hand-rolled.** No first-party Strands GCP reference and no
  TS Lambda layer; lean on the Terraform deploy guide for AWS and treat the rest as
  unverified.

## Repo conventions

- **Pinning split.** Tool versions (`bun`/`terraform`/`aws-cli`) live only in
  `mise.toml`; npm runtime deps are pinned exact (`x.y.z`, no `latest`/`^`) in
  `package.json` + `bun.lock`. The docs' `npm install <pkg>` (floating) is not the
  repo convention.
- **`zero runtime deps` is true only until the SDK lands.** Adopting
  `@strands-agents/sdk` (+ `zod`) breaks that posture on purpose — update
  `AGENTS.md` in the same change so it doesn't keep claiming zero-dep.
- **Doc-URL drift.** The doc map hardcodes ~30 URLs; if a `fetch_doc` 404s, fall
  back to `search_docs`. Periodically verify the map still resolves.
