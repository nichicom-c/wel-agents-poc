---
paths:
  - "mise.toml"
  - "**/mise.toml"
  - "**/.mise.toml"
---

# mise.toml conventions

`mise.toml` is the single source of truth for tooling in this repo. It pins the tools under `[tools]` (`aws-cli`, `bun`, `terraform`) and defines the `bootstrap` (alias `bs`) / `clean` tasks under `[tasks.*]`.

- **Versions live only in `mise.toml`.** Never hardcode a tool version in docs or scripts — reference mise instead. If a version ever has to be duplicated somewhere that cannot read `mise.toml` (e.g. a future Dockerfile `FROM` tag — none exists today, this runs directly on Bun with no build step), pin the identical version and bump both in the same change.
- **Pin exact versions only** — a full `x.y.z`. `latest` / `any` are forbidden.
- **Single root config.** The repo uses Bun workspaces (per-surface `package.json` under `packages/`), but the toolchain is unified, so there is only the root `mise.toml`. mise merges a subdirectory `mise.toml` / `.mise.toml` over the root; add one only when a future subdir genuinely needs a different tool or version.
- **`mise trust` before use.** After creating or editing any `mise.toml` / `.mise.toml`, run `mise trust` in that directory.
- **Verify the active toolchain** matches the file with `mise current`.
- **`bun` is not on the shell PATH until mise's env is active** (mise-managed). You don't have to wrap every command with `mise exec --`: because there is a single root mise config (the Bun workspaces share one toolchain), there is exactly one resolved toolchain across the whole repo, so activating the shell once — `eval "$(mise activate zsh)"` — puts `bun` / `bunx` on PATH and is enough. Reserve `mise exec -- bun ...` / `mise exec -- bunx ...` for contexts that can't assume an activated shell — non-interactive scripts like `tools/bootstrap.sh` and `tools/clean.sh`. (`mise run <task>` already executes inside mise's resolved environment.)
