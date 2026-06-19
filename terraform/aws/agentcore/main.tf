# Data sources:
# 現在 Terraform が使っている AWS account と region を読み取り、bucket 名・ARN・runtime 環境変数の
# 組み立てに利用する。
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_iam_session_context" "current" {
  arn = data.aws_caller_identity.current.arn
}

# --- AgentCore Memory (short-term) ---
# 会話 event（user + assistant のターン）を session / actor 単位で保持する。long-term strategy は
# 使わず raw event のみ（event_expiry_duration 日で失効）。
resource "aws_bedrockagentcore_memory" "this" {
  name                  = local.memory_name
  description           = "Short-term conversation memory for the wel-agents-poc RAG runtime."
  event_expiry_duration = var.event_expiry_duration
  tags                  = var.tags
}

# --- AgentCore Runtime (container) ---
# TypeScript app を載せたコンテナイメージを ARM64 で起動し、HTTP protocol（GET /ping・
# POST /invocations）で公開する。環境変数で generation model ID・複数の KB ID・Memory ID を渡す。
resource "aws_bedrockagentcore_agent_runtime" "this" {
  agent_runtime_name = local.runtime_name
  description        = "wel-agents-poc AgentCore: supervisor + multiple specialist RAG agents."
  role_arn           = aws_iam_role.runtime.arn

  agent_runtime_artifact {
    container_configuration {
      container_uri = local.container_uri
    }
  }

  environment_variables = local.runtime_env

  network_configuration {
    network_mode = "PUBLIC"
  }

  protocol_configuration {
    server_protocol = "HTTP"
  }

  request_header_configuration {
    request_header_allowlist = [
      "X-Amzn-Bedrock-AgentCore-Runtime-Custom-ActorId",
      "X-Amzn-Bedrock-AgentCore-Runtime-Custom-UserId",
    ]
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy.runtime,
  ]
}

# Terraform 管理の custom endpoint を 1 つ作る（endpoint lifecycle も管理対象にする）。
# agent_runtime_version を runtime の最新バージョンへ紐づける。これを省くと endpoint は作成時の
# バージョン（v1）に固定され、コード更新でイメージを push・apply しても invoke 先（qualifier=sample）が
# 旧バージョンを実行し続ける。明示参照により apply だけで sample が最新バージョンへ追従する。
resource "aws_bedrockagentcore_agent_runtime_endpoint" "sample" {
  name                  = local.endpoint_name
  agent_runtime_id      = aws_bedrockagentcore_agent_runtime.this.agent_runtime_id
  agent_runtime_version = aws_bedrockagentcore_agent_runtime.this.agent_runtime_version
  description           = "Sample endpoint for the wel-agents-poc RAG runtime."
  tags                  = var.tags
}
