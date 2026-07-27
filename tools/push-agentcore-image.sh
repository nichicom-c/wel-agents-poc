#!/bin/bash
set -euo pipefail

# ARM64 ホスト（Apple Silicon Mac / Graviton EC2 など）で AgentCore Runtime コンテナを
# build & push するための helper。QEMU エミュレーションが無い x86_64 ホストでは
# `docker build --platform linux/arm64` が `exec format error` で失敗するため、
# ネイティブ ARM64 ホストでの実行を想定する。
#
# 使い方: リポジトリのルートで clone した後、このスクリプトを実行するだけでよい
# （Dockerfile.agentcore が bun install / build を内部で行うため、事前準備は不要）。
#   bash tools/push-agentcore-image.sh
#
# terraform/aws/agentcore の値と揃える場合は環境変数で上書きする:
#   AWS_REGION=ap-northeast-1 AWS_ACCOUNT_ID=... ECR_REPOSITORY=... IMAGE_TAG=latest \
#     bash tools/push-agentcore-image.sh

AWS_REGION="${AWS_REGION:-ap-northeast-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-328513660901}"
ECR_REPOSITORY="${ECR_REPOSITORY:-wel-agents-rag-runtime}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

FILE_PATH=$(dirname "$0")
cd "${FILE_PATH}/../" || exit 1

REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_URI="${REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"

echo "[INFO] push-agentcore-image start"
echo "[INFO] Working directory: $(pwd)"
echo "[INFO] Image URI: ${IMAGE_URI}"

echo ""
echo "[INFO] ECR login: Start"
if aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${REGISTRY}"; then
  echo "[OK] ECR login: Success"
else
  echo "[NG] ECR login: Failed"
  exit 1
fi

echo ""
echo "[INFO] docker build (linux/arm64): Start"
if docker build --platform linux/arm64 -f Dockerfile.agentcore -t "${IMAGE_URI}" .; then
  echo "[OK] docker build: Success"
else
  echo "[NG] docker build: Failed"
  exit 1
fi

echo ""
echo "[INFO] docker push: Start"
if docker push "${IMAGE_URI}"; then
  echo "[OK] docker push: Success"
else
  echo "[NG] docker push: Failed"
  exit 1
fi

echo ""
echo "[INFO] push-agentcore-image finished: ${IMAGE_URI}"
