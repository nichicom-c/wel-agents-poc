locals {
  user_pool_name = "${var.name_prefix}-user-pool"
  client_name    = "${var.name_prefix}-web"

  # Hosted UI domain prefix は AWS 全体で一意。未指定なら account ID を付与して衝突を避ける。
  domain_prefix = coalesce(var.domain_prefix, "${var.name_prefix}-${data.aws_caller_identity.current.account_id}")

  # JWT issuer（access/ID token の iss クレーム）。BFF の jwt_issuer に設定する値。
  issuer = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${aws_cognito_user_pool.this.id}"

  # Hosted UI / OAuth2 endpoint の base URL。chat-ui の VITE_AUTH_ISSUER に設定する値。
  hosted_ui_base_url = "https://${aws_cognito_user_pool_domain.this.domain}.auth.${data.aws_region.current.region}.amazoncognito.com"
}
