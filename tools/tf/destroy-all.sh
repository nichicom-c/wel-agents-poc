#!/bin/bash
# tools/tf/destroy-all.sh
# Destroys all terraform/aws stacks in reverse dependency order:
#   chat-ui -> bff -> auth -> agentcore
# All stateful resources are teardown-safe (force_destroy / force_delete /
# deletion_protection=INACTIVE), so this completes non-interactively.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/tf/lib.sh
source "${DIR}/lib.sh"

preflight_common
for stack in ${STACKS_DESTROY_ORDER}; do
  echo "[INFO] destroy: ${stack}"
  tf_init "${stack}"
  tf "${stack}" destroy -auto-approve
  echo "[OK] destroyed: ${stack}"
done
echo "[OK] aws:destroy complete (all stacks)"
