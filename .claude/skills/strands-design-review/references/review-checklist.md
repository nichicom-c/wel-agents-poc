# Review checklist

Use when **reviewing** existing Strands code/infra. Grouped by area; each item is
a thing to confirm or flag. Verify Strands specifics against the mapped doc
(`references/doc-map.md`) — do not pass/fail from memory.

## Imports & SDK

- [ ] Imports are from `@strands-agents/sdk` / documented subpaths. Flag
  `strands-agents` (Python), `@strands/sdk`, any `@tool`/decorator, or file-path
  tool loading (Python-only, won't compile in TS).

## Tools

- [ ] Custom tools use `tool()` with a Zod `inputSchema`; config keys are exactly
  `name`/`description`/`inputSchema`/`callback`; `name` matches `^[a-zA-Z0-9_-]+$`
  (1–64); `description` states purpose/when-to-use/params/output/limits (flag
  terse one-liners).
- [ ] Flag a JSON-Schema `inputSchema` where typed/validated input is expected (it
  yields unvalidated `unknown`).

## Invocation & output

- [ ] `invoke()` is awaited; `stream()` is consumed with `for await`; output is
  read via the real `AgentResult` accessors / `agent.messages` — flag
  `result.text` / `result.output`.
- [ ] `structuredOutput` consumers wrap `invoke()` in try/catch for
  `StructuredOutputError`.

## Secrets & config

- [ ] No hardcoded model ids, regions, API keys, AWS keys, or guardrail/KB/Memory
  ids in committed `packages/` — all from env/config. Bedrock relies on the AWS SDK
  credential chain / IAM role.

## Run loop

- [ ] The run loop is bounded (`limits` and/or `cancelSignal`) so a PoC can't loop
  or burn tokens; long-running tools observe `context.agent.cancelSignal`;
  `appState` values are JSON-serializable.

## Multi-agent

- [ ] Agents-as-tools sub-agents have `name` + `description` (+ `printer: false`)
  and `preserveContext` is intentional; TS Swarm sets `maxSteps`/`timeout` and
  agents have `id` + `description`; TS Graph relies on AND-join semantics and sets
  `maxSteps` for cycles; `sessionManager` is on the orchestrator only.

## Providers

- [ ] A non-Bedrock provider has its optional dep installed (`openai` /
  `@anthropic-ai/sdk`) and is imported from the right subpath; `OpenAIModel`
  includes the required `api` field; `guardrailConfig` uses the TS nested
  `redaction.{input,output}` shape, not Python flat fields.

## Deployment

- [ ] Service exposes `GET /ping` + `POST /invocations` on `0.0.0.0:port`;
  AgentCore uses `express.raw({ type: '*/*' })` + `TextDecoder` and an ARM64 image;
  IAM grants both `bedrock:InvokeModel` and `InvokeModelWithResponseStream` scoped
  to model ARNs (flag `Resource: '*'`); the AgentCore role includes ECR pull,
  CloudWatch Logs (`/aws/bedrock-agentcore/runtimes/*`), X-Ray, scoped
  `PutMetricData`, and the correct trust policy.
- [ ] `terraform/gc`: if calling Bedrock from Cloud Run, AWS keys are injected as
  `sensitive` tfvars (not forgotten, not committed); public `roles/run.invoker`
  for `allUsers` is intentional or locked down; architecture is consistent across
  Dockerfile/Terraform/deps.

## Observability

- [ ] `setupTracer()` is paired with declared `@opentelemetry/*` peer deps (and
  Bun compatibility of `sdk-trace-node` verified); `traceAttributes` carry no PII;
  `result.metrics` is actually consumed; no claim that the SDK redacts PII
  natively.

## Versions & tests

- [ ] Runtime deps pinned exact (no `latest`/`^`) in `package.json`/`bun.lock`;
  tool versions live only in `mise.toml`; `package.json` stays ESM.
- [ ] Tests/local dev avoid live Bedrock/KB/Memory/AWS calls unless integration is
  explicitly requested; secrets and Terraform state are not committed.
