#!/bin/bash
set -euo pipefail

# Project root directory
FILE_PATH=$(dirname "$0")
cd "$FILE_PATH/../" || exit 1

echo "[INFO] Bootstrap start"
echo "[INFO] Working directory: $(pwd)"

##############################################################################
##
##  mise
##
##############################################################################
echo ""
echo "[INFO] mise install: Start"
if type mise >/dev/null 2>&1; then
  mise trust >/dev/null 2>&1 || true
  if mise install; then
    echo "[OK] mise install: Success"
  else
    echo "[NG] mise install: Failed"
    exit 1
  fi
else
  echo "[WARNING] mise install: Skip mise because it could not be found."
  echo "[WARNING] mise install: See https://mise.jdx.dev/getting-started.html for installation."
fi

##############################################################################
##
##  bun (root の package.json / bun は mise 経由で解決)
##
##############################################################################
echo ""
echo "[INFO] bun install: Start"
if mise exec -- bun --version >/dev/null 2>&1; then
  if mise exec -- bun install; then
    echo "[OK] bun install: Success"
  else
    echo "[NG] bun install: Failed"
    exit 1
  fi
else
  echo "[WARNING] bun install: Skip bun because it could not be resolved via mise."
  echo "[WARNING] bun install: This may be because the mise install has not completed."
fi

##############################################################################
##
##  lefthook (git hooks / lefthook.yml に従って install)
##
##############################################################################
echo ""
echo "[INFO] lefthook install: Start"
if ! { type git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; }; then
  echo "[WARNING] lefthook install: Skip (git repository not found)."
elif mise exec -- bunx lefthook version >/dev/null 2>&1; then
  if mise exec -- bunx lefthook install; then
    echo "[OK] lefthook install: Success"
  else
    echo "[NG] lefthook install: Failed"
    exit 1
  fi
else
  echo "[WARNING] lefthook install: Skip lefthook because it could not be resolved (run bun install first)."
fi

##############################################################################
##
##  Finish
##
##############################################################################
echo ""
echo "[INFO] Bootstrap finished"
