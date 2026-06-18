variable "name_prefix" {
  description = "Prefix used for Cognito resource names."
  type        = string
  default     = "wel-agents-auth"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.name_prefix))
    error_message = "name_prefix must be 3-32 lowercase alphanumeric or hyphen characters and start with a letter."
  }
}

variable "domain_prefix" {
  description = "Cognito Hosted UI domain prefix. Must be globally unique. Defaults to \"<name_prefix>-<account_id>\"."
  type        = string
  default     = null

  validation {
    condition     = var.domain_prefix == null || can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", var.domain_prefix))
    error_message = "domain_prefix must be 1-63 lowercase alphanumeric or hyphen characters and must not start or end with a hyphen."
  }
}

variable "callback_urls" {
  description = "OAuth callback URLs for the SPA client. Cognito allows only HTTPS, except HTTP loopback URLs for testing."
  type        = list(string)
  default     = ["http://localhost:4173/"]

  validation {
    condition = (
      length(var.callback_urls) > 0 &&
      alltrue([
        for url in var.callback_urls :
        startswith(url, "https://") || can(regex("^http://(localhost|127\\.0\\.0\\.1|\\[::1\\])(:[0-9]{1,5})?([/?].*)?$", url))
      ])
    )
    error_message = "callback_urls must be non-empty and each entry must be https:// or an HTTP loopback URL for localhost, 127.0.0.1, or [::1]."
  }
}

variable "logout_urls" {
  description = "OAuth sign-out URLs for the SPA client. Same scheme rules as callback_urls."
  type        = list(string)
  default     = ["http://localhost:4173/"]

  validation {
    condition = alltrue([
      for url in var.logout_urls :
      startswith(url, "https://") || can(regex("^http://(localhost|127\\.0\\.0\\.1|\\[::1\\])(:[0-9]{1,5})?([/?].*)?$", url))
    ])
    error_message = "logout_urls entries must be https:// or an HTTP loopback URL for localhost, 127.0.0.1, or [::1]."
  }
}

variable "allowed_oauth_scopes" {
  description = "OAuth scopes the SPA client may request."
  type        = list(string)
  default     = ["openid", "email", "profile"]

  validation {
    condition     = length(var.allowed_oauth_scopes) > 0
    error_message = "allowed_oauth_scopes must contain at least one scope."
  }
}

variable "access_token_validity_minutes" {
  description = "Access token lifetime in minutes (5-1440)."
  type        = number
  default     = 60

  validation {
    condition     = var.access_token_validity_minutes >= 5 && var.access_token_validity_minutes <= 1440
    error_message = "access_token_validity_minutes must be between 5 and 1440."
  }
}

variable "id_token_validity_minutes" {
  description = "ID token lifetime in minutes (5-1440)."
  type        = number
  default     = 60

  validation {
    condition     = var.id_token_validity_minutes >= 5 && var.id_token_validity_minutes <= 1440
    error_message = "id_token_validity_minutes must be between 5 and 1440."
  }
}

variable "refresh_token_validity_days" {
  description = "Refresh token lifetime in days (1-3650)."
  type        = number
  default     = 30

  validation {
    condition     = var.refresh_token_validity_days >= 1 && var.refresh_token_validity_days <= 3650
    error_message = "refresh_token_validity_days must be between 1 and 3650."
  }
}

variable "deletion_protection" {
  description = "Cognito user pool deletion protection. INACTIVE eases PoC teardown."
  type        = string
  default     = "INACTIVE"

  validation {
    condition     = contains(["ACTIVE", "INACTIVE"], var.deletion_protection)
    error_message = "deletion_protection must be ACTIVE or INACTIVE."
  }
}

variable "site_callback_urls" {
  description = "Deployed site callback URLs appended to callback_urls (e.g. chat-ui CloudFront site_url). Injected by tools/tf/apply-stack.sh on pass 2; empty on first apply."
  type        = list(string)
  default     = []
}

variable "site_logout_urls" {
  description = "Deployed site logout URLs appended to logout_urls. Injected by tools/tf/apply-stack.sh on pass 2; empty on first apply."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to AWS resources that support tagging."
  type        = map(string)
  default = {
    Project   = "wel-agents-poc"
    Purpose   = "auth"
    ManagedBy = "terraform"
  }
}
