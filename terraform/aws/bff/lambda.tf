resource "aws_cloudwatch_log_group" "lambda" {
  name              = local.lambda_log_group_name
  retention_in_days = var.log_retention_in_days
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "api" {
  name              = local.api_log_group_name
  retention_in_days = var.log_retention_in_days
  tags              = var.tags
}

resource "aws_lambda_function" "this" {
  filename         = data.archive_file.lambda.output_path
  function_name    = local.function_name
  handler          = "index.handler"
  memory_size      = var.lambda_memory_size
  role             = aws_iam_role.lambda.arn
  runtime          = var.lambda_runtime
  source_code_hash = data.archive_file.lambda.output_base64sha256
  timeout          = var.lambda_timeout_seconds

  environment {
    variables = {
      AGENT_RUNTIME_ARN               = var.agent_runtime_arn
      AGENT_RUNTIME_ID                = local.agent_runtime_id
      AGENT_RUNTIME_QUALIFIER         = var.agent_runtime_qualifier
      AGENT_RUNTIME_REGION            = local.agent_runtime_region
      BFF_ACTOR_CLAIM                 = var.bff_actor_claim
      BFF_AUTH_MODE                   = "jwt"
      BFF_USER_ID_CLAIM               = var.bff_user_id_claim
      DEFAULT_ACTOR_ID                = var.default_actor_id
      DEV_INFO_AGENTCORE_MEMORY_ID    = local.dev_info_agentcore_memory_id
      DEV_INFO_AUTH_CLIENT_ID         = local.dev_info_auth_client_id
      DEV_INFO_DATABASE_KB_ID         = local.dev_info_database_kb_id
      DEV_INFO_DOCUMENT_KB_ID         = local.dev_info_document_kb_id
      DEV_INFO_LAW_KB_ID              = local.dev_info_law_kb_id
      DEV_INFO_MEDICAL_CARE_LAW_KB_ID = local.dev_info_medical_care_law_kb_id
      DEV_INFO_SUPPORT_ACTIVITY_KB_ID = local.dev_info_support_activity_kb_id
      DEV_INFO_JWT_ISSUER             = var.jwt_issuer
      DEV_INFO_LAMBDA_LOG_GROUP_NAME  = aws_cloudwatch_log_group.lambda.name
      REQUEST_TIMEOUT_MS              = tostring(var.request_timeout_ms)
      WS_URL_EXPIRES_SECONDS          = tostring(var.ws_url_expires_seconds)
    }
  }

  tags = var.tags

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda,
  ]
}
