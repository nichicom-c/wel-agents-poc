# Data sources:
# 現在 Terraform が使っている AWS account と region を読み取り、issuer URL・Hosted UI URL・domain prefix の
# 組み立てに利用する。
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# --- Cognito User Pool ---
# BFF / chat-ui を保護する OIDC provider。組織内ユーザー向けの PoC なので self sign-up は無効化し、
# 管理者がユーザーを作成する（admin_create_user_config）。email でサインインする。
resource "aws_cognito_user_pool" "this" {
  name = local.user_pool_name

  # email をユーザー名としてサインインさせ、email を自動検証する。
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # 組織内 PoC: 自己登録を禁止し、管理者だけがユーザーを作成する。
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # 組織ベースラインとして長さ 12・英大小+数字を必須にする（symbol は必須にしない）。
  # 本番でさらに強化する場合は require_symbols / minimum_length を引き上げる。
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_uppercase                = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # PoC では MFA を無効にする（本番では "ON" / "OPTIONAL" + software token などを検討する）。
  mfa_configuration = "OFF"

  # PoC では cleanup.md で destroy できるよう削除保護を無効化する（本番は "ACTIVE" を検討）。
  deletion_protection = var.deletion_protection

  tags = var.tags
}

# --- Hosted UI domain ---
# Cognito 提供の prefix domain。Hosted UI / OAuth2 endpoint（/oauth2/authorize・/oauth2/token）の
# base URL になる。prefix は AWS 全体で一意である必要があるため、既定では account ID を付与する。
resource "aws_cognito_user_pool_domain" "this" {
  domain       = local.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

# --- App Client (public, PKCE) ---
# ブラウザ SPA（chat-ui）用の public client。client secret は持たず、Authorization Code + PKCE のみ許可する。
# chat-ui は取得した access token を BFF へ Bearer 送信し、API Gateway JWT authorizer が検証する。
resource "aws_cognito_user_pool_client" "web" {
  name         = local.client_name
  user_pool_id = aws_cognito_user_pool.this.id

  # public client（secret 無し）。PKCE を使う。
  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = var.allowed_oauth_scopes
  supported_identity_providers         = ["COGNITO"]

  callback_urls = distinct(concat(var.callback_urls, var.site_callback_urls))
  logout_urls   = distinct(concat(var.logout_urls, var.site_logout_urls))

  # Hosted UI 以外の直接認証は SRP + refresh のみ許可する（password grant は無効）。
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = var.access_token_validity_minutes
  id_token_validity      = var.id_token_validity_minutes
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # OAuth flow を使うには user pool に domain が必要なため、domain 作成後に client を作る。
  depends_on = [aws_cognito_user_pool_domain.this]
}
