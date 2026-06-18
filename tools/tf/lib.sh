#!/bin/bash
# tools/tf/lib.sh
# Shared helpers for the terraform/aws apply & destroy orchestration scripts.
# Sourced by apply-stack.sh / apply-all.sh / destroy-stack.sh / destroy-all.sh.
# Target: bash 3.2 (macOS /bin/bash). Tool calls go through `mise exec --` for
# mise-pinned tools; the container engine and `mise` are bare PATH lookups.
set -euo pipefail

# Keep AWS CLI v2 non-interactive in orchestration tasks.
export AWS_PAGER=""

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${LIB_DIR}/../.." && pwd)"
TF_AWS_DIR="${REPO_ROOT}/terraform/aws"

# Dependency order. Apply forward, destroy reverse.
# STACKS_APPLY_ORDER documents the canonical forward order for reference; apply-all.sh
# encodes the 2-pass sequence explicitly (pass 2 is a subset), so only destroy-all.sh
# loops over its order variable.
STACKS_APPLY_ORDER="agentcore auth bff chat-ui"
STACKS_DESTROY_ORDER="chat-ui bff auth agentcore"

# --- terraform wrappers (mise-pinned) ---
tf() { # tf <stack> <terraform-args...>
  local stack="$1"; shift
  mise exec -- terraform -chdir="${TF_AWS_DIR}/${stack}" "$@"
}

tf_init() { # tf_init <stack>  (idempotent; fast when already initialized)
  # Do NOT redirect: keep terraform init's provider/backend errors visible
  # (a fresh checkout with no .terraform/ is the most likely real failure point).
  tf "$1" init -input=false
}

tf_out_raw() { # tf_out_raw <stack> <output-name>
  tf "$1" output -raw "$2"
}

tf_out_json() { # tf_out_json <stack> <output-name>
  tf "$1" output -json "$2"
}

# --- container engine detection (docker / finch / podman) ---
detect_container_engine() {
  local e
  for e in docker finch podman; do
    if command -v "${e}" >/dev/null 2>&1; then
      echo "${e}"
      return 0
    fi
  done
  return 1
}

# --- preflight: AWS creds check + loud account/region banner ---
# Runs once per process tree: apply-all/destroy-all run it, export the flag,
# and child apply-stack invocations inherit it and skip the re-print.
preflight_common() {
  if [ "${AWS_ORCH_PREFLIGHT_DONE:-}" = "1" ]; then
    return 0
  fi
  command -v mise >/dev/null 2>&1 || { echo "[NG] mise not found on PATH"; exit 1; }
  local t
  for t in terraform aws jq bun; do
    mise exec -- "${t}" --version >/dev/null 2>&1 \
      || { echo "[NG] mise cannot resolve '${t}'. Run: mise install"; exit 1; }
  done

  local account region
  account="$(mise exec -- aws sts get-caller-identity --query Account --output text)" \
    || { echo "[NG] AWS credentials unusable (aws sts get-caller-identity failed)"; exit 1; }
  region="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(mise exec -- aws configure get region 2>/dev/null || echo "")}}"
  # The banner is the only wrong-account safeguard under full -auto-approve, so
  # fail closed rather than print "Region: unknown".
  [ -n "${region}" ] \
    || { echo "[NG] AWS region unresolved. Set AWS_REGION / AWS_DEFAULT_REGION or run 'aws configure'."; exit 1; }

  echo "==================================================================="
  echo "[WARNING] terraform/aws orchestration: FULL NON-INTERACTIVE (-auto-approve)"
  echo "[INFO] AWS Account : ${account}"
  echo "[INFO] AWS Region  : ${region}"
  echo "==================================================================="

  export AWS_ORCH_PREFLIGHT_DONE=1
}
