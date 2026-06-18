#!/bin/bash
# tools/tf/destroy-stack.sh <stack>
# Destroys a single terraform/aws stack non-interactively. No builds, no wiring.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/tf/lib.sh
source "${DIR}/lib.sh"

stack="${1:-}"
case "${stack}" in
  agentcore|auth|bff|chat-ui) ;;
  *) echo "[NG] usage: destroy-stack.sh <agentcore|auth|bff|chat-ui>"; exit 1 ;;
esac

preflight_common
echo "[INFO] destroy: ${stack}"
tf_init "${stack}"
tf "${stack}" destroy -auto-approve
echo "[OK] destroyed: ${stack}"
