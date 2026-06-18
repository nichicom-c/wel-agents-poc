locals {
  agent_runtime_arn_parts    = regex("^arn:([^:]+):bedrock-agentcore:([^:]+):([0-9]{12}):runtime/(.+)$", var.agent_runtime_arn)
  agent_runtime_partition    = local.agent_runtime_arn_parts[0]
  agent_runtime_region       = local.agent_runtime_arn_parts[1]
  agent_runtime_account_id   = local.agent_runtime_arn_parts[2]
  agent_runtime_id           = local.agent_runtime_arn_parts[3]
  agent_runtime_endpoint_arn = "${var.agent_runtime_arn}/runtime-endpoint/${var.agent_runtime_qualifier}"

  api_log_group_name              = "/aws/apigateway/${local.api_name}"
  api_name                        = "${var.name_prefix}-api"
  dev_info_agentcore_memory_id    = trimspace(var.dev_info_agentcore_memory_id)
  agentcore_memory_arn            = local.dev_info_agentcore_memory_id != "" ? "arn:${local.agent_runtime_partition}:bedrock-agentcore:${local.agent_runtime_region}:${local.agent_runtime_account_id}:memory/${local.dev_info_agentcore_memory_id}" : ""
  dev_info_auth_client_id         = trimspace(var.dev_info_auth_client_id) != "" ? trimspace(var.dev_info_auth_client_id) : var.jwt_audience[0]
  dev_info_database_kb_id         = trimspace(var.dev_info_database_kb_id)
  dev_info_document_kb_id         = trimspace(var.dev_info_document_kb_id)
  dev_info_law_kb_id              = trimspace(var.dev_info_law_kb_id)
  dev_info_medical_care_law_kb_id = trimspace(var.dev_info_medical_care_law_kb_id)
  dev_info_support_activity_kb_id = trimspace(var.dev_info_support_activity_kb_id)
  knowledge_base_ids = distinct(compact([
    local.dev_info_database_kb_id,
    local.dev_info_document_kb_id,
    local.dev_info_law_kb_id,
    local.dev_info_medical_care_law_kb_id,
    local.dev_info_support_activity_kb_id,
  ]))
  knowledge_base_arns = [
    for knowledge_base_id in local.knowledge_base_ids :
    "arn:${local.agent_runtime_partition}:bedrock:${local.agent_runtime_region}:${local.agent_runtime_account_id}:knowledge-base/${knowledge_base_id}"
  ]
  function_name         = "${var.name_prefix}-handler"
  lambda_log_group_name = "/aws/lambda/${local.function_name}"
}
