---
name: strands-design-review
description: Design or review Strands Agents code and infrastructure — the agent code under `packages/` and the Terraform under `terraform/` (aws, gc). Use when planning, implementing, or reviewing work on the Strands Agents TypeScript SDK (`@strands-agents/sdk`) on Bun, Amazon Bedrock AgentCore, model providers, custom tools, MCP tools, agents-as-tools, swarm/graph/workflow multi-agent, sessions, streaming, structured output, guardrails, or observability.
---

# Strands Design Review

Ground every Strands design or review claim in current official documentation
before making it. This repo targets the **Strands Agents TypeScript SDK
(`@strands-agents/sdk`) on Bun** — default every claim to TypeScript, and **never
assert Strands-specific behavior from memory**: fetch the doc first.

This skill uses progressive disclosure — `Read` the `references/*.md` you need for
the task at hand.

## Repo invariants

- **TS SDK on Bun.** Runtime package is `@strands-agents/sdk` (not the Python
  `strands-agents`, not `@strands/sdk`). Bun runs TypeScript in `packages/` directly
  with no build step. Local entry points are `bun run start` for the Chat UI dev
  server and `bun run start:server` for the AgentCore Runtime adapter.
- **Default model** is Amazon Bedrock + Claude Sonnet 4.6, configured via
  `process.env` — never a committed model-id/region literal.
- **Credentials & config stay external** (IAM role / env / Terraform vars):
  AWS keys, API keys, guardrail/KB/Memory ids. Secrets and Terraform state are
  never committed.
- **Exact-version pinning.** Tool versions (`bun`/`terraform`/`aws-cli`) live only
  in `mise.toml`; npm runtime deps are pinned exact (`x.y.z`) in `package.json` +
  `bun.lock`. No `latest`/`^`.
- **`packages/` vs `terraform/{aws,gc}` split** — agent behavior in `packages/`, all infra
  in `terraform/`.

## Workflow

1. **Read the local target first** — the code under `packages/`, the Terraform under
   `terraform/{aws,gc}`, READMEs, and any tests. Know what exists before judging.
2. **Identify the Strands surface** — agent loop, custom/MCP tools, multi-agent,
   model provider, sessions/state, streaming, structured output, guardrails,
   observability, or AgentCore/Terraform deployment.
3. **Jump to the official doc** for that surface via the map below /
   `references/doc-map.md`, using `mcp__strands__fetch_doc(uri=<URL>)`. If the
   concern is unmapped or a URL 404s, use `mcp__strands__search_docs(query=...)`
   and prefer the `/typescript/` or `/api/typescript/` result.
4. **Compare** the local code or proposal against the documented pattern **and**
   this repo's conventions (the invariants above).
5. **Report** the docs consulted, the conclusion, gaps/risks, and the verification
   still needed (typecheck, a doc still to confirm, a Bun-compatibility check).

## Doc map (index)

Whenever you need a doc and don't already know the URL, open
**`references/doc-map.md`** — the full concern → doc-URL → MCP-query table. Its
top-level groups:

- **Scaffolding & Agent API** — quickstart, `Agent`, `AgentConfig`.
- **Tools** — overview, custom `tool()`, MCP tools, executors, vended tools.
- **Agent internals** — agent loop, state, conversation/session management,
  structured output, hooks, prompts.
- **Multi-agent** — pattern selection, agents-as-tools, swarm, graph, A2A.
- **Model providers** — provider matrix, Amazon Bedrock, `BedrockModelOptions`.
- **Deployment & infra** — AgentCore (TS), Terraform HCL, production hardening,
  Docker (TS).
- **Safety & observability** — guardrails, traces, metrics.

## References

Open the one(s) that fit the task — they are one level deep from this file:

- **`references/doc-map.md`** — the full table behind the index above (hot path).
- **`references/typescript-sdk.md`** — SDK package/imports, `Agent`/`tool()`/result
  API, the dependency ledger, and the Python-vs-TS divergence list.
- **`references/architecture.md`** — recommended `packages/` and `terraform/{aws,gc}`
  structure (read when **designing the project's layout**).
- **`references/design-checklist.md`** — design checklist + pattern-selection guide
  (single vs multi-agent, custom vs vended vs MCP tool, deploy target, ...).
- **`references/review-checklist.md`** — review checklist grouped by area.
- **`references/gotchas.md`** — fast cross-cutting trap scan for both modes.

## When the `strands` MCP server is unavailable

Under Codex, or if `uvx`/the server isn't installed, the map's URLs are public
`strandsagents.com` pages — fetch them with the active web-fetch/web-search tool
instead. If no documentation source is reachable at all, state that blocker and do
not present Strands-specific behavior as verified.
