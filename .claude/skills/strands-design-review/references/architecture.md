# Project structure: `packages/` and `terraform/`

How to design the layout of this repo when it grows from the echo stub into a
real Strands agent + its infrastructure. Keep the repo's `packages/` (agent behavior)
vs `terraform/{aws,gc}` (infra) split intact throughout.

## `packages/` layout

- **Current entry points.** `packages/server.ts` is the AgentCore Runtime HTTP adapter,
  `packages/runtime.ts` owns request handling / config / memory / supervisor execution,
  `packages/agents.ts` builds the supervisor + specialist agents, and
  `packages/chat-ui-dev-server.ts` serves the local static Chat UI.
- **Provider-agnostic model wiring → `packages/model.ts`.** A small factory reads
  `BEDROCK_MODEL_ID` / `AWS_DEFAULT_REGION` / `AWS_REGION` via `Config` and returns
  a `Model` (default Bedrock / Sonnet 4.6). All model ids/regions stay out of
  committed source. Import providers from their documented subpaths.
- **Tools live with the owning runtime module.** The active KB search tool is in
  `packages/knowledge-base.ts` because it binds Bedrock Knowledge Base retrieval.
  Introduce a dedicated tools directory only if multiple reusable custom tools return
  and there is an active caller.
- **Context layering, not globals.** Per-request data (`userId`, `requestId`,
  secrets) flows via `agent.invoke(prompt, { invocationState: {...} })` and is
  read in callbacks via `context.invocationState`. Cross-turn non-model state uses
  `agent.appState` (JSON-serializable only). Model-visible data stays in messages.
- **Run-loop safety for any direct agent invocation:** use `limits` and/or
  `cancelSignal` for non-trivial calls, inspect `result.stopReason`, and keep
  `printer: false` for server contexts.
- **Split optional capabilities into their own modules** so the lean baseline
  stays clean:
  - `packages/telemetry.ts` — calls `setupTracer()` (from `@strands-agents/sdk/telemetry`)
    before the Agent is built; pulls in `@opentelemetry/*` peer deps.
  - `packages/plugins/logging.ts` — a `Plugin` implementing `initAgent` +
    `addHook(Before/AfterToolCallEvent)`.
  - `packages/server.ts` — Bun `/ping` + `/invocations` AgentCore Runtime adapter.
  - `packages/agents/<role>.ts` — multi-agent specialists.
- **Leave `tsconfig.json` as-is** (`noEmit`, `types: ['bun']`); it only drives
  `tsc --noEmit`. Keep `package.json` ESM (`"type": "module"` — already true).
  Add `sessions/` to `.gitignore` if `FileStorage` is used.

## `terraform/aws` and `terraform/gc` layout

Both directories are **empty placeholder READMEs today** (`後日記載`). Infra
guidance here is forward-looking design, not a review of existing HCL — say so.
Treat the AWS HCL in the Terraform deploy guide as the authoritative copy-paste
source; treat GCP / Bun-container HCL as hand-rolled and unverified.

### `terraform/aws`

- **Pick ONE compute target per environment** — don't author all three. For a
  PoC the lowest-friction TS-native path is **Bedrock AgentCore Runtime**
  (serverless, session isolation, IAM-via-role). Use **Fargate** only if
  streaming / high concurrency is required; **Lambda** only if cheapest +
  no-streaming is acceptable.
- **Files:** `main.tf` (provider `hashicorp/aws ~> 5.0` + the compute resource),
  `variables.tf`, `iam.tf` (the load-bearing piece), `outputs.tf`, and a tracked
  `*.tfvars.template` fed from `.local` / env. Mark provider-key vars
  `sensitive = true`.
- **Variables (config, not secrets):** `agent_image` (ECR URI/tag), `aws_region`,
  `bedrock_model_id`, and for AgentCore the `role_arn` / runtime name; any KB /
  AgentCore Memory / guardrail ids. AWS credentials are **not** Terraform vars on
  AWS — Bedrock auth flows through the service IAM role.
- **IAM is the core deliverable:** an execution/task role granting
  `bedrock:InvokeModel` **and** `bedrock:InvokeModelWithResponseStream` (scope
  `Resource` to the foundation-model ARNs/region in prod — never `*`). For
  AgentCore add the trust policy (principal `bedrock-agentcore.amazonaws.com`,
  `sts:AssumeRole`, with `aws:SourceAccount` + `aws:SourceArn` conditions), ECR
  pull, CloudWatch Logs under `/aws/bedrock-agentcore/runtimes/*`, X-Ray, and
  namespace-scoped `cloudwatch:PutMetricData`. If sessions use `S3Storage`, add
  `s3:PutObject/GetObject/DeleteObject/ListBucket` on the bucket.
- **HTTP contract** (when the agent is a service): `GET /ping` + `POST /invocations`
  bound to `0.0.0.0`. AgentCore listens on `8080`, App Runner on `8080`, Cloud Run
  on `$PORT`. AgentCore `/invocations` gets a **binary** payload:
  `express.raw({ type: '*/*' })` + `TextDecoder`.

### `terraform/gc`

- Build from the Terraform guide's `google_cloud_run_service` block (provider
  `hashicorp/google ~> 4.0`): container on `$PORT`, image from Artifact Registry,
  `google_cloud_run_service_iam_member`.
- The guide default grants `roles/run.invoker` to `allUsers` (public) — rarely
  correct for prod; lock it down or confirm it is intentional.
- [WARNING] **Cross-cloud Bedrock footgun:** on GCP there is no implicit Bedrock
  IAM. Calling Bedrock from Cloud Run means injecting
  `aws_access_key_id`/`aws_secret_access_key` as `sensitive` tfvars. Prefer a
  GCP-native provider (Google/Gemini, or an OpenAI-compatible endpoint) to avoid
  cross-cloud keys entirely.

### Cross-cutting

- **Architecture consistency** is a recurring silent failure: AgentCore and the
  Fargate example are ARM64; the Terraform Lambda example pins x86_64. Keep the
  Dockerfile `--platform`, Terraform `architectures`, and dependency installs on
  **one** architecture.
- If a Bun container is used, pin an exact Bun base image version (the version
  source of truth is `mise.toml`) — the docs only cover `node:20` + npm + `tsc`,
  so a Bun image is untested by Strands.
- Secrets and state are never committed (`.gitignore` already covers
  `.terraform/`, `*.tfstate*`, `*.tfplan`, `*.local`, `.env*`).
  `.terraform.lock.hcl` stays tracked. Tool versions (`terraform`, `aws-cli`)
  live only in `mise.toml`.
