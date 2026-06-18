output "region" {
  description = "この Terraform 実行で使用した AWS region。"
  value       = data.aws_region.current.region
}

output "user_pool_id" {
  description = "Cognito User Pool ID。"
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN。"
  value       = aws_cognito_user_pool.this.arn
}

output "app_client_id" {
  description = "SPA 用 public app client ID（BFF の jwt_audience / chat-ui の VITE_AUTH_CLIENT_ID）。"
  value       = aws_cognito_user_pool_client.web.id
}

output "jwt_issuer" {
  description = "BFF の jwt_issuer に設定する OIDC issuer URL（token の iss クレーム）。"
  value       = local.issuer
}

output "jwt_audience" {
  description = "BFF の jwt_audience に設定する値。Cognito access token は aud を持たず client_id を使うため app client ID を入れる。"
  value       = [aws_cognito_user_pool_client.web.id]
}

output "hosted_ui_base_url" {
  description = "Hosted UI / OAuth2 endpoint の base URL（chat-ui の VITE_AUTH_ISSUER）。"
  value       = local.hosted_ui_base_url
}

output "bff_jwt_config" {
  description = "terraform/aws/bff/terraform.tfvars に転記する JWT authorizer 設定。"
  value = {
    jwt_issuer   = local.issuer
    jwt_audience = [aws_cognito_user_pool_client.web.id]
  }
}

output "chat_ui_auth_env" {
  description = "chat-ui を build する際の VITE_AUTH_* 環境変数（VITE_AUTH_REDIRECT_URI は配信 URL に合わせて設定）。"
  value = {
    VITE_AUTH_ISSUER    = local.hosted_ui_base_url
    VITE_AUTH_CLIENT_ID = aws_cognito_user_pool_client.web.id
    VITE_AUTH_SCOPE     = join(" ", var.allowed_oauth_scopes)
  }
}
