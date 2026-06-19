output "region" {
  description = "この Terraform 実行で使用した AWS region。"
  value       = data.aws_region.current.region
}

output "ecr_repository_url" {
  description = "AgentCore Runtime コンテナイメージを push する ECR repository の URL。"
  value       = aws_ecr_repository.this.repository_url
}

output "container_uri" {
  description = "AgentCore Runtime が参照するコンテナイメージ URI。"
  value       = local.container_uri
}

output "data_bucket_name" {
  description = "Knowledge Base data source 用のサンプル文書を置く S3 bucket 名。"
  value       = aws_s3_bucket.data.bucket
}

output "vector_bucket_name" {
  description = "S3 Vectors の vector bucket 名。"
  value       = aws_s3vectors_vector_bucket.this.vector_bucket_name
}

output "knowledge_base_ids" {
  description = "ドメインごとの Knowledge Base ID（app の DATABASE_KB_ID / DOCUMENT_KB_ID / LAW_KB_ID / LAW_HIERARCHICAL_KB_ID / MEDICAL_CARE_LAW_KB_ID / SUPPORT_ACTIVITY_KB_ID に対応）。"
  value = merge(
    { for key, kb in aws_bedrockagent_knowledge_base.this : key => kb.id },
    { law_hierarchical = aws_bedrockagent_knowledge_base.law_hierarchical.id },
    { support_activity = aws_bedrockagent_knowledge_base.support_activity.id },
  )
}

output "law_hierarchical_knowledge_base_id" {
  description = "law_hierarchical 比較用 Knowledge Base ID（app の LAW_HIERARCHICAL_KB_ID に対応）。"
  value       = aws_bedrockagent_knowledge_base.law_hierarchical.id
}

output "law_hierarchical_opensearch_collection_endpoint" {
  description = "law_hierarchical OpenSearch Serverless collection endpoint。"
  value       = aws_opensearchserverless_collection.law_hierarchical.collection_endpoint
}

output "support_activity_knowledge_base_id" {
  description = "support_activity SQL Knowledge Base ID（app の SUPPORT_ACTIVITY_KB_ID に対応）。"
  value       = aws_bedrockagent_knowledge_base.support_activity.id
}

output "support_activity_knowledge_base_arn" {
  description = "support_activity SQL Knowledge Base ARN（app の SUPPORT_ACTIVITY_KB_ARN に対応）。"
  value       = aws_bedrockagent_knowledge_base.support_activity.arn
}

output "support_activity_redshift_workgroup_name" {
  description = "support_activity SQL Knowledge Base の Redshift Serverless workgroup 名。"
  value       = aws_redshiftserverless_workgroup.support_activity.workgroup_name
}

output "memory_id" {
  description = "AgentCore Memory の ID（app の AGENTCORE_MEMORY_ID に対応）。"
  value       = aws_bedrockagentcore_memory.this.id
}

output "memory_arn" {
  description = "AgentCore Memory の ARN。"
  value       = aws_bedrockagentcore_memory.this.arn
}

output "agent_runtime_arn" {
  description = "作成した AgentCore Runtime の ARN。"
  value       = aws_bedrockagentcore_agent_runtime.this.agent_runtime_arn
}

output "agent_runtime_id" {
  description = "作成した AgentCore Runtime の ID。"
  value       = aws_bedrockagentcore_agent_runtime.this.agent_runtime_id
}

output "agent_runtime_endpoint_name" {
  description = "Terraform で作成した AgentCore Runtime endpoint 名。"
  value       = aws_bedrockagentcore_agent_runtime_endpoint.sample.name
}

output "agent_runtime_endpoint_arn" {
  description = "Terraform で作成した sample endpoint の ARN。"
  value       = aws_bedrockagentcore_agent_runtime_endpoint.sample.agent_runtime_endpoint_arn
}

output "build_push_commands" {
  description = "Dockerfile.agentcore を build し ECR へ push する手順（リポジトリルートで実行。apply 前に必要）。"
  value = [
    "aws ecr get-login-password --region ${data.aws_region.current.region} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com",
    "docker build --platform linux/arm64 -f Dockerfile.agentcore -t ${aws_ecr_repository.this.repository_url}:${var.image_tag} .",
    "docker push ${aws_ecr_repository.this.repository_url}:${var.image_tag}",
  ]
}

output "start_ingestion_commands" {
  description = "VECTOR Knowledge Base の文書 ingestion と support_activity SQL Knowledge Base の metadata sync を起動する AWS CLI コマンド。"
  value = concat(
    [
      for key, ds in aws_bedrockagent_data_source.this :
      "aws bedrock-agent start-ingestion-job --knowledge-base-id ${aws_bedrockagent_knowledge_base.this[key].id} --data-source-id ${ds.data_source_id} --region ${data.aws_region.current.region}"
    ],
    [
      "aws bedrock-agent start-ingestion-job --knowledge-base-id ${aws_bedrockagent_knowledge_base.law_hierarchical.id} --data-source-id ${aws_bedrockagent_data_source.law_hierarchical.data_source_id} --region ${data.aws_region.current.region}",
    ],
    [
      "aws bedrock-agent start-ingestion-job --knowledge-base-id ${aws_bedrockagent_knowledge_base.support_activity.id} --data-source-id ${aws_bedrockagent_data_source.support_activity_metadata.data_source_id} --region ${data.aws_region.current.region}",
    ],
  )
}

output "support_activity_metadata_data_source_id" {
  description = "support_activity SQL Knowledge Base の REDSHIFT_METADATA data source ID。"
  value       = aws_bedrockagent_data_source.support_activity_metadata.data_source_id
}

output "support_activity_retrieve_command" {
  description = "support_activity SQL Knowledge Base を直接 retrieve する AWS CLI コマンド例。"
  value = join(" ", [
    "mise exec -- aws bedrock-agent-runtime retrieve",
    "--knowledge-base-id '${aws_bedrockagent_knowledge_base.support_activity.id}'",
    "--retrieval-query '{\"text\":\"Count support cases by status\"}'",
    "--region ${data.aws_region.current.region}",
  ])
}

output "invoke_command" {
  description = "sample endpoint 経由で AgentCore Runtime を invoke する AWS CLI コマンド例。"
  value = join(" ", [
    "mkdir -p tmp && mise exec -- aws bedrock-agentcore invoke-agent-runtime",
    "--agent-runtime-arn '${aws_bedrockagentcore_agent_runtime.this.agent_runtime_arn}'",
    "--qualifier '${aws_bedrockagentcore_agent_runtime_endpoint.sample.name}'",
    "--content-type application/json",
    "--accept application/json",
    "--cli-binary-format raw-in-base64-out",
    "--payload '{\"prompt\":\"What is Amazon S3?\",\"session_id\":\"s1\",\"actor_id\":\"u1\"}'",
    "tmp/response.json",
  ])
}
