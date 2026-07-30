resource "aws_apigatewayv2_api" "this" {
  name          = local.api_name
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers = ["authorization", "content-type"]
    allow_methods = ["GET", "POST", "PATCH", "OPTIONS"]
    allow_origins = var.cors_allowed_origins
    max_age       = 300
  }

  tags = var.tags
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_method     = "POST"
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.this.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.this.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${local.api_name}-jwt"

  jwt_configuration {
    audience = var.jwt_audience
    issuer   = var.jwt_issuer
  }
}

resource "aws_apigatewayv2_route" "chat" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/chat"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "soap_draft" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/soap-draft"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "soap_gaps" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/soap-gaps"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "ws_url" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/ws-url"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "dev_info" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/dev-info"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "knowledge_base_overview" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/knowledge-bases/{domain}"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "knowledge_base_documents" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/knowledge-bases/{domain}/data-sources/{dataSourceId}/documents"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "soap_records_create" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/soap-records"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "soap_records_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/soap-records"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "soap_records_versions" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/soap-records/{recordId}/versions"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "professional_comments_create" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/professional-comments"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "professional_comments_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/professional-comments"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "material_candidates_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/material-candidates"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "material_candidates_create" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/material-candidates"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "material_candidates_status" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "PATCH /api/material-candidates/{candidateId}/status"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "materials_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/materials"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "materials_create" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/materials"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "materials_status" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "PATCH /api/materials/{materialId}/status"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "rubrics_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/rubrics"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "rubrics_create" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/rubrics"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "rubrics_review_status" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "PATCH /api/rubrics/{rubricId}/review-status"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "reference_knowledge_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/reference-knowledge"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "soap_mapping_versions_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/soap-mapping-versions"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "soap_mapping_versions_create" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/soap-mapping-versions"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "required_items_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/required-items"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "required_items_create" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/required-items"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "quality_metrics_list" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/quality-metrics"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "voice_recordings_create" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "POST /api/voice-recordings"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "voice_recordings_status" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/voice-recordings/{recordingId}"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "voice_recordings_edit" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "PATCH /api/voice-recordings/{recordingId}"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "sessions" {
  api_id               = aws_apigatewayv2_api.this.id
  authorization_scopes = var.jwt_authorization_scopes
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.jwt.id
  route_key            = "GET /api/sessions"
  target               = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_route" "ping" {
  api_id    = aws_apigatewayv2_api.this.id
  route_key = "GET /ping"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      httpMethod     = "$context.httpMethod"
      integrationErr = "$context.integrationErrorMessage"
      ip             = "$context.identity.sourceIp"
      protocol       = "$context.protocol"
      requestId      = "$context.requestId"
      requestTime    = "$context.requestTime"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
    })
  }

  default_route_settings {
    detailed_metrics_enabled = true
    throttling_burst_limit   = var.throttling_burst_limit
    throttling_rate_limit    = var.throttling_rate_limit
  }

  tags = var.tags
}

resource "aws_lambda_permission" "api_gateway" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
