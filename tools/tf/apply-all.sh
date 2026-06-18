#!/bin/bash
# tools/tf/apply-all.sh
# Full from-zero apply of all terraform/aws stacks.
#   Pass 1: agentcore -> auth -> bff -> chat-ui   (chat-ui creates site_url)
#   Pass 2: auth -> chat-ui                        (resolve auth<->chat-ui cycle)
# apply-stack.sh reads upstream outputs live, so pass 2 simply re-applies auth
# (now with site_url) and chat-ui (now with the real redirect URI).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/tf/lib.sh
source "${DIR}/lib.sh"

preflight_common   # banner once; child apply-stack runs inherit AWS_ORCH_PREFLIGHT_DONE
# Fail fast for the full path: agentcore needs a container engine to build/push the
# runtime image. (Per-stack aws:apply:auth/:bff/:chat-ui stay engine-free.)
detect_container_engine >/dev/null \
  || { echo "[NG] no container engine (docker/finch/podman) — required for the agentcore image"; exit 1; }

echo "[INFO] === Pass 1: agentcore -> auth -> bff -> chat-ui ==="
"${DIR}/apply-stack.sh" agentcore
"${DIR}/apply-stack.sh" auth
"${DIR}/apply-stack.sh" bff
"${DIR}/apply-stack.sh" chat-ui

echo "[INFO] === Pass 2: auth -> chat-ui (resolve site_url cycle) ==="
"${DIR}/apply-stack.sh" auth
"${DIR}/apply-stack.sh" chat-ui

echo "[OK] aws:apply complete. NOTE: KB ingestion is async — specialist agents"
echo "[OK] cannot retrieve until each ingestion job reaches COMPLETE."
