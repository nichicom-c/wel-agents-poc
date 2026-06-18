#!/bin/bash
set -euo pipefail

# Project root directory
FILE_PATH=$(dirname "$0")
cd "${FILE_PATH}/../" || exit 1

echo "[INFO] Clean start"
echo "[INFO] Working directory: $(pwd)"
echo "[INFO] Reverses 'mise run bs' (bootstrap). mise-managed tools are kept (shared install)."

##############################################################################
##
##  lefthook (git hooks の uninstall — node_modules 削除より前に実行する)
##
##############################################################################
echo ""
echo "[INFO] lefthook uninstall: Start"
if ! { type git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; }; then
  echo "[WARNING] lefthook uninstall: Skip (git repository not found)."
elif mise exec -- bunx lefthook version >/dev/null 2>&1; then
  if mise exec -- bunx lefthook uninstall; then
    echo "[OK] lefthook uninstall: Success"
  else
    echo "[NG] lefthook uninstall: Failed"
    exit 1
  fi
else
  echo "[WARNING] lefthook uninstall: Skip lefthook because it could not be resolved."
fi

##############################################################################
##
##  bun (node_modules/ のみ削除。bun.lock はコミット対象の lockfile なので残す)
##
##############################################################################
echo ""
echo "[INFO] bun artifacts: Start"
# Bun workspaces は workspace ごとに packages/<name>/node_modules を作るため、
# ルートだけでなく各 workspace の node_modules も削除する（packages/* は新規追加にも追従）。
removed_any=0
for nm in node_modules packages/*/node_modules; do
  if [ -d "${nm}" ]; then
    rm -rf "${nm}"
    echo "[OK] bun artifacts: Removed ${nm}/"
    removed_any=1
  fi
done
if [ "${removed_any}" -eq 0 ]; then
  echo "[INFO] bun artifacts: node_modules/ not found (skip)."
fi
echo "[INFO] bun artifacts: Kept bun.lock (committed lockfile)."

##############################################################################
##
##  mise tools (共有インストールのため残す)
##
##############################################################################
echo ""
echo "[INFO] mise tools: Kept. Remove manually if needed: mise uninstall bun terraform aws-cli"

##############################################################################
##
##  Finish
##
##############################################################################
echo ""
echo "[INFO] Clean finished. Re-run 'mise run bs' to restore."
