# AGENTS.md

AI-agent guide for `wel-agents-poc` — a Bun-workspaces proof-of-concept for building agents, tooling pinned by [mise](https://mise.jdx.dev/). Entry points: `packages/agentcore/index.ts` (AgentCore Runtime wrapper for `packages/agentcore/adapters/http-server.ts` + supervisor / multiple specialist RAG runtime), `packages/bff/lambda.ts` / `packages/bff/dev-server.ts` (production Lambda and local BFF wrappers over `packages/bff/adapters/`), and `packages/chat-ui/` (React + Vite Chat UI); it targets the Strands Agents TypeScript SDK (see below).

## TL;DR

- **Bun workspaces monorepo** — three workspaces under `packages/` (`@wel-agents-poc/agentcore`, `@wel-agents-poc/bff`, `@wel-agents-poc/chat-ui`), each owning its runtime dependencies and its `build` script in a local `package.json`. The root `package.json` holds the workspace list, the cross-cutting dev tooling (Biome, TypeScript, lefthook, `@types/bun`), the package-wide scripts (`ci` / `test` / `check` / `typecheck`), and `build` / `build:agentcore` / `build:bff` / `build:ui` entry points that delegate to each workspace's `build` via `bun run --filter`. A single root `bun.lock` covers all workspaces. Bun runs the TypeScript in `packages/` directly for dev entrypoints; deployable artifacts are built into `dist/`: `bun run build:agentcore` bundles the AgentCore Runtime, `bun run build:bff` bundles the production BFF Lambda plus runnable local BFF server, and `bun run build:ui` builds the React Chat UI. Per-workspace deps are pinned exact (`@strands-agents/sdk` + `zod` + AWS SDK v3 in agentcore/bff, React + Vite in chat-ui); root `tsconfig.json` only drives typechecking across all `packages/`.
- **AgentCore**: `packages/agentcore/index.ts` is the root entrypoint; `packages/agentcore/adapters/http-server.ts` exposes the AgentCore HTTP contract (`GET /ping`, `POST /invocations`) via `Bun.serve`; application code lives in `packages/agentcore/application/`, pure session rules in `packages/agentcore/domain/`, data contracts in `packages/agentcore/contracts/`, and AWS/provider integrations in `packages/agentcore/infra/`. The supervisor owns four vector-KB specialists (`database`, `document`, `law`, `medical_care_law`) plus the additive `support_activity` structured-data specialist; `support_activity` always uses the Bedrock SQL Knowledge Base at runtime, while DuckDB is only a developer dependency for generating committed synthetic CSV / Parquet. BFF uses the same layer convention: `packages/bff/dev-server.ts` and `packages/bff/lambda.ts` are root wrappers, `packages/bff/adapters/` contains the local/Lambda adapters, `packages/bff/application/` contains shared request handling, `packages/bff/contracts/` contains payload contracts, `packages/bff/domain/` contains chat/session rules, and `packages/bff/infra/` contains the AgentCore Runtime SDK client/config. `packages/chat-ui/` contains the React browser UI and Vite proxies `/api/chat` to a BFF in local dev; `Dockerfile.agentcore` containerizes the server (Bun/ARM64) and `terraform/aws/agentcore/` provisions ECR + vector Knowledge Bases (S3 Vectors) + the comparison-only `law_hierarchical` Knowledge Base (OpenSearch Serverless + HIERARCHICAL chunking) + the `support_activity` SQL Knowledge Base (Redshift Serverless / Spectrum + Glue Data Catalog + Lake Formation) + AgentCore Memory + IAM.
- `mise.toml` is the **single source of version truth** (`[tools]`: `aws-cli` / `bun` / `jq` / `terraform`) and defines the tasks (`[tasks.*]`): `bootstrap`/`clean`, the local runtime entrypoints `dev:*` / `start:*` (each `cd`s into the owning `packages/<runtime>/` so Bun/Vite load that directory's `.env`), and the `terraform/aws` orchestration `aws:apply` / `aws:destroy` (+ per-stack `aws:apply:<stack>` / `aws:destroy:<stack>`) backed by `tools/tf/`. Per-runtime env templates live at `packages/{agentcore,bff,chat-ui}/.env.example` (copy each to a gitignored sibling `.env`); there is no root `.env` template. Package-wide `build` / `test` / `typecheck` / `check` stay in `package.json`.
- Quality gate: **Biome** (format + lint, `biome.json`) + **TypeScript** (`tsc --noEmit`) + **lefthook** (`pre-commit`, installed by bootstrap).

## Run

The `bun run` commands below assume mise is activated in your shell (`eval "$(mise activate zsh)"`); the `mise run`/`mise tasks` rows run inside mise's resolved environment, so they are copy-paste safe regardless.

| Purpose | Command |
| --- | --- |
| Full setup (`tools/bootstrap.sh`: mise install → bun install → lefthook install) | `mise run bs` |
| Reset to pre-bootstrap (`tools/clean.sh`: lefthook uninstall → drop root + workspace `node_modules/`, keep `bun.lock` + mise tools) | `mise run clean` |
| Build all deployable artifacts | `bun run build` (runs `build:agentcore`, `build:bff`, and `build:ui`) |
| Run the AgentCore from source | `mise run dev:agentcore` (cd packages/agentcore → `bun index.ts`, reads `packages/agentcore/.env`; serves `/ping` + `/invocations` on `0.0.0.0:${PORT:-8080}`) |
| Run the built AgentCore | `mise run start:agentcore` (runs `dist/agentcore/agentcore.mjs` from packages/agentcore; run `bun run build:agentcore` first) |
| Run the local BFF from source | `mise run dev:bff` (cd packages/bff → `bun dev-server.ts`, reads `packages/bff/.env`; serves `/ping` + `/api/chat` on `127.0.0.1:${BFF_PORT:-4174}` and proxies to `AGENTCORE_RUNTIME_URL`) |
| Run the built local BFF | `mise run start:bff` (runs `dist/bff-dev-server/index.mjs` from packages/bff; run `bun run build:bff` first) |
| Run the local React Chat UI | `mise run dev:ui` (cd packages/chat-ui → `bunx --bun vite`, reads `packages/chat-ui/.env`; serves on `127.0.0.1:${CHAT_UI_PORT:-4173}` and proxies `/api/chat` to `BFF_URL` or local BFF) |
| Run the built React Chat UI | `mise run start:ui` (previews `dist/chat-ui/` from packages/chat-ui; run `bun run build:ui` first) |
| Apply all `terraform/aws` stacks | `mise run aws:apply` (`tools/tf/apply-all.sh`: `agentcore`→`auth`→`bff`→`chat-ui` then 2-pass `auth`→`chat-ui`; build + ECR push + `terraform output` injection; full auto `-auto-approve`; per-stack `aws:apply:<stack>`) |
| Destroy all `terraform/aws` stacks | `mise run aws:destroy` (`tools/tf/destroy-all.sh`: reverse order `chat-ui`→`bff`→`auth`→`agentcore`; full auto `-auto-approve`; per-stack `aws:destroy:<stack>`) |
| Build the AgentCore artifact | `bun run build:agentcore` (bundles `packages/agentcore/index.ts` to `dist/agentcore/agentcore.mjs`; Dockerfile also runs this in its builder stage) |
| Build BFF artifacts | `bun run build:bff` (bundles Lambda artifact to `dist/bff-lambda/index.mjs` and local BFF server to `dist/bff-dev-server/index.mjs`) |
| Build Chat UI assets | `bun run build:ui` (builds `packages/chat-ui/` to `dist/chat-ui/`; `terraform/aws/chat-ui` deploys this directory) |
| Run tests (`bun:test`) | `bun run test` (or `bun test`) |
| Typecheck | `bun run typecheck` |
| Lint + format (read-only / autofix) | `bun run check` / `bun run check:fix` |
| Bump dependency versions | `bun run ncu` |
| Verify Codex Strands MCP server | `mise exec -- uvx strands-agents-mcp-server` |
| List tasks | `mise tasks` |

> [WARNING] A bare `bun` is **not on the shell PATH** until mise is activated (mise-managed) → without activation, `command not found` (exit 127). Activate once with `eval "$(mise activate zsh)"` (the `bun run` rows above assume this), or prefix `mise exec -- ` per command. `mise run` tasks work either way.

The `pre-commit` hook (`lefthook.yml`) runs `bun run check:fix` on staged `*.{js,ts,jsx,tsx,json,jsonc}` files and re-stages the fixes.

## Layout

See the directory tree in [`README.md`](./README.md#ディレクトリ構成) — it is the single source for the layout and per-path notes. Read the files themselves for their contents.

## Conventions

- [OK] Pin **exact** tool versions in `mise.toml` (`x.y.z`), [NG] `latest`/`any`. Versions live **only** there — never in docs/scripts. Verify with `mise current`; `mise trust` any new `mise.toml` before use.
- [OK] Style is enforced by Biome (via the hook or `check:fix`) — don't hand-format or restate its rules in prose.
- [OK] Markdown prose = **one paragraph per physical line**; rely on the editor's soft-wrap. [NG] width-driven line breaks inside a paragraph/blockquote — even at sentence (`。`) boundaries. Exempt: fenced code, tables, separate list items, intentional hard breaks. When joining wrapped lines apply the text-style spacing (JP↔JP incl. full-width punctuation → no space; ASCII↔JP → one half-width space; ASCII↔ASCII → one space).
- [OK] Shell scripts: `set -euo pipefail`, quote every variable (`"${var}"`), status via `[OK]`/`[NG]`/`[WARNING]`/`[INFO]`, no decorative emoji.
- [OK] Secrets: never hardcode. Templates take a `.template` suffix; machine-specific values go in `.local` files or env vars.
- [OK] Write throwaway/scratch files (ad-hoc output, scratch notes, logs) to `tmp/` — it is gitignored and never committed; don't scatter temp files in the repo root or package dirs.
- [OK] When you change config / scripts / docs, update all related places together.

## Strands Agents SDK work

This repo targets the **Strands Agents TypeScript SDK** (`@strands-agents/sdk`) on Bun — not the Python `strands-agents` package.

- **Use the `strands-design-review` skill** for any design / implementation / review of the agent code (`packages/`) or the Terraform (`terraform/` aws, gc). It carries the workflow + repo invariants (default model, credentials kept external) and its `references/doc-map.md` maps each concern to its official doc URL + `strands` MCP query.
- In Codex, use the repo skill `$strands-docs` for Strands documentation research; it routes through the configured `claude-code` MCP server first and falls back to official `strandsagents.com` pages without adding `uvx` packages.
- The `strands` MCP server (`.mcp.json`: `uvx strands-agents-mcp-server`) serves the Strands SDK docs. Verify it is loaded with `/mcp` before relying on `mcp__strands__*`.
- Name the pattern before building: model-driven agent / custom tools / MCP tools / multi-agent (agents-as-tools, swarm, graph, A2A) / session & memory / streaming / structured output / model provider / AgentCore. Prefer the documented pattern over ad hoc orchestration.
- Ground every Strands claim in current docs before asserting it — prefer the `strands` MCP server (`mcp__strands__fetch_doc` / `mcp__strands__search_docs`), else the public `strandsagents.com` URLs. Never assert Strands behavior from memory; default to the TypeScript SDK.
- Runtime deps `@strands-agents/sdk` + `zod` + AWS SDK v3 (`@aws-sdk/client-bedrock-agent-runtime` for KB `Retrieve`, `@aws-sdk/client-bedrock-agentcore` for Memory `CreateEvent`/`ListEvents`) are pinned **exact** (`x.y.z`) in their owning workspace `package.json` (`packages/agentcore`, `packages/bff`) + the single root `bun.lock` — never `latest`/`^`. The SDK's required peers (`@modelcontextprotocol/sdk`, `@opentelemetry/api`) are resolved and pinned in `bun.lock` by Bun's peer install; add them explicitly only if a future install stops resolving them.
- AgentCore Memory has no TS equivalent of Python `MemoryClient.get_last_k_turns`; `ListEvents` order is unspecified, so `packages/agentcore/infra/memory.ts` sorts events by `eventTimestamp` before formatting recent history. The AgentCore TS deploy docs use Express, but `packages/agentcore/adapters/http-server.ts` implements the same `/ping` + `/invocations` contract with `Bun.serve`; `packages/agentcore/index.ts` remains the root wrapper bundled by `bun run build:agentcore` before Docker copies the built artifact into the runtime image (switch to exact-pinned `express` only if a protocol incompatibility surfaces).
