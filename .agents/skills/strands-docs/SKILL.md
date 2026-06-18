---
name: strands-docs
description: Research and apply current official Strands Agents documentation for this repo without adding uv/uvx packages. Use when working on Strands Agents TypeScript SDK (`@strands-agents/sdk`) code, the AgentCore runtime under `packages/agentcore/`, Strands MCP tools, custom tools, multi-agent patterns, model providers, Bedrock AgentCore, Terraform under `terraform/`, or when reviewing/designing Strands behavior and docs need to be verified through Claude Code MCP or official `strandsagents.com` pages.
---

# Strands Docs

## Overview

Use this skill to ground Strands work in current official docs while keeping the repo free of new `uv`/`uvx` package additions. Prefer the configured `claude-code` MCP server, which can use this project's approved `.mcp.json` `strands` server; fall back to public `strandsagents.com` docs when that route is unavailable.

## Workflow

1. Read the local target first: `packages/`, `terraform/`, `AGENTS.md`, `README.md`, and the relevant `.claude/skills/strands-design-review/references/*.md` map when useful.
2. Identify the Strands surface before researching: model-driven agent, custom tools, MCP tools, multi-agent, session/state, streaming, structured output, model provider, Bedrock AgentCore, Terraform, guardrails, or observability.
3. Use the `claude-code` MCP server first when its tools are available:
   - Prefer its `Agent` tool for broad or multi-page research.
   - Prefer its `WebFetch` tool for one known official URL.
   - Ask Claude Code to use the connected project `strands` MCP server when possible.
4. If `claude-code` MCP is not available, use Codex web/search tools against official Strands pages only. Prefer URLs under `https://strandsagents.com/docs/`, and for clean markdown append `/index.md` to documentation page paths when available.
5. Report the source route used, official URLs consulted, TypeScript-vs-Python caveats, and the implementation or review implication for this repo.

## Claude Code Prompt

For `claude-code` MCP `Agent`, use a prompt shaped like this and fill in the concrete concern:

```text
Research the official Strands Agents documentation for this repo.

Concern: <specific Strands surface or question>
Target: TypeScript SDK on Bun, package @strands-agents/sdk, not Python.
Use the connected project `strands` MCP server if available; otherwise use official strandsagents.com docs.
Do not edit files. Do not install packages. Do not run uvx.
Return: official URLs consulted, relevant sections, TypeScript-specific findings, Python-only caveats, and the concrete recommendation for this repo.
```

## Guardrails

- Do not add `uv`, `uvx`, `strands-agents-mcp-server`, or other MCP runtime packages to this repo.
- Do not assert Strands behavior from memory. If official docs cannot be reached, state the blocker and stop short of Strands-specific claims.
- Prefer TypeScript documentation paths (`/typescript/`, `/api/typescript/`) over Python pages. Flag Python-only APIs explicitly.
- Treat `.claude/skills/strands-design-review/references/doc-map.md` as a navigation hint, not proof. Verify with official docs before using a claim.
- Keep credentials, AWS config, model IDs, regions, guardrail IDs, KB IDs, and Terraform state external.

## Output Shape

For research/review answers, include:

- `Docs route`: `claude-code MCP`, `Codex web fallback`, or `blocked`.
- `Sources`: official Strands URLs used.
- `Finding`: concise answer grounded in the docs.
- `Repo impact`: what to implement, avoid, or verify in this Bun TypeScript repo.
- `Gaps`: any unavailable docs or unverified behavior.
