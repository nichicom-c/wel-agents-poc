# --- AgentCore Runtime コンテナイメージの ECR repository ---
# TypeScript path は direct code ZIP ではなくコンテナイメージを使う。本 module が repository を
# 作成し、Dockerfile.agentcore で build したイメージをここへ push する（apply 前に push 必須）。
resource "aws_ecr_repository" "this" {
  name = "${var.name_prefix}-runtime"

  # PoC なので destroy 時にイメージごと削除できるようにする。
  force_delete         = true
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}
