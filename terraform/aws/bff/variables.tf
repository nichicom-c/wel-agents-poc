variable "agent_runtime_arn" {
  description = "AgentCore Runtime ARN invoked by the BFF Lambda."
  type        = string

  validation {
    condition     = can(regex("^arn:[^:]+:bedrock-agentcore:[^:]+:[0-9]{12}:runtime/.+$", var.agent_runtime_arn))
    error_message = "agent_runtime_arn must be an AgentCore Runtime ARN."
  }
}

variable "agent_runtime_qualifier" {
  description = "AgentCore Runtime endpoint qualifier to invoke."
  type        = string
  default     = "sample"

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$", var.agent_runtime_qualifier))
    error_message = "agent_runtime_qualifier must start with an alphanumeric character and contain only A-Z, a-z, 0-9, _ or -."
  }
}

variable "cors_allowed_origins" {
  description = "Allowed browser origins for API Gateway CORS."
  type        = list(string)
  default     = ["*"]

  validation {
    condition     = length(var.cors_allowed_origins) > 0
    error_message = "cors_allowed_origins must contain at least one origin."
  }
}

variable "default_actor_id" {
  description = "Actor ID sent to the AgentCore runtime payload when browser authentication is not enabled."
  type        = string
  default     = "web-user"

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", var.default_actor_id))
    error_message = "default_actor_id must start with an alphanumeric character and contain only A-Z, a-z, 0-9, _ or -."
  }
}

variable "dev_info_agentcore_memory_id" {
  description = "Optional AgentCore Memory ID displayed by GET /api/dev-info."
  type        = string
  default     = ""

  validation {
    condition     = var.dev_info_agentcore_memory_id == "" || length(trimspace(var.dev_info_agentcore_memory_id)) > 0
    error_message = "dev_info_agentcore_memory_id must be empty or non-empty after trimming."
  }
}

variable "dev_info_auth_client_id" {
  description = "Optional auth client ID displayed by GET /api/dev-info. Defaults to the first jwt_audience value when empty."
  type        = string
  default     = ""

  validation {
    condition     = var.dev_info_auth_client_id == "" || length(trimspace(var.dev_info_auth_client_id)) > 0
    error_message = "dev_info_auth_client_id must be empty or non-empty after trimming."
  }
}

variable "dev_info_database_kb_id" {
  description = "Optional database Knowledge Base ID displayed by GET /api/dev-info."
  type        = string
  default     = ""

  validation {
    condition     = var.dev_info_database_kb_id == "" || length(trimspace(var.dev_info_database_kb_id)) > 0
    error_message = "dev_info_database_kb_id must be empty or non-empty after trimming."
  }
}

variable "dev_info_document_kb_id" {
  description = "Optional document Knowledge Base ID displayed by GET /api/dev-info."
  type        = string
  default     = ""

  validation {
    condition     = var.dev_info_document_kb_id == "" || length(trimspace(var.dev_info_document_kb_id)) > 0
    error_message = "dev_info_document_kb_id must be empty or non-empty after trimming."
  }
}

variable "dev_info_law_kb_id" {
  description = "Optional law Knowledge Base ID displayed by GET /api/dev-info."
  type        = string
  default     = ""

  validation {
    condition     = var.dev_info_law_kb_id == "" || length(trimspace(var.dev_info_law_kb_id)) > 0
    error_message = "dev_info_law_kb_id must be empty or non-empty after trimming."
  }
}

variable "dev_info_medical_care_law_kb_id" {
  description = "Optional medical care law textbook Knowledge Base ID displayed by GET /api/dev-info."
  type        = string
  default     = ""

  validation {
    condition     = var.dev_info_medical_care_law_kb_id == "" || length(trimspace(var.dev_info_medical_care_law_kb_id)) > 0
    error_message = "dev_info_medical_care_law_kb_id must be empty or non-empty after trimming."
  }
}

variable "dev_info_support_activity_kb_id" {
  description = "Optional support activity SQL Knowledge Base ID displayed by GET /api/dev-info."
  type        = string
  default     = ""

  validation {
    condition     = var.dev_info_support_activity_kb_id == "" || length(trimspace(var.dev_info_support_activity_kb_id)) > 0
    error_message = "dev_info_support_activity_kb_id must be empty or non-empty after trimming."
  }
}

variable "bff_actor_claim" {
  description = "JWT claim used as the BFF-derived AgentCore actor ID source."
  type        = string
  default     = "sub"

  validation {
    condition     = length(trimspace(var.bff_actor_claim)) > 0
    error_message = "bff_actor_claim must be non-empty."
  }
}

variable "bff_user_id_claim" {
  description = "JWT claim used as the authenticated BFF user ID."
  type        = string
  default     = "sub"

  validation {
    condition     = length(trimspace(var.bff_user_id_claim)) > 0
    error_message = "bff_user_id_claim must be non-empty."
  }
}

variable "jwt_audience" {
  description = "Accepted JWT audiences for API Gateway JWT authorizer."
  type        = list(string)

  validation {
    condition = (
      length(var.jwt_audience) > 0 &&
      alltrue([for audience in var.jwt_audience : length(trimspace(audience)) > 0])
    )
    error_message = "jwt_audience must contain at least one non-empty audience."
  }
}

variable "jwt_authorization_scopes" {
  description = "Optional JWT scopes required by protected BFF routes. Leave empty to require only a valid issuer and audience."
  type        = list(string)
  default     = []

  validation {
    condition = (
      alltrue([for scope in var.jwt_authorization_scopes : length(trimspace(scope)) > 0])
    )
    error_message = "jwt_authorization_scopes must contain only non-empty scopes."
  }
}

variable "jwt_issuer" {
  description = "OIDC issuer URL for API Gateway JWT authorizer."
  type        = string

  validation {
    condition     = startswith(trimspace(var.jwt_issuer), "https://")
    error_message = "jwt_issuer must be an https URL."
  }
}

variable "lambda_memory_size" {
  description = "Memory size in MB for the BFF Lambda function."
  type        = number
  default     = 256

  validation {
    condition     = var.lambda_memory_size >= 128 && var.lambda_memory_size <= 10240
    error_message = "lambda_memory_size must be between 128 and 10240."
  }
}

variable "lambda_runtime" {
  description = "Node.js Lambda runtime for the BFF handler."
  type        = string
  default     = "nodejs22.x"

  validation {
    condition     = contains(["nodejs22.x"], var.lambda_runtime)
    error_message = "lambda_runtime must be nodejs22.x."
  }
}

variable "lambda_timeout_seconds" {
  description = "Timeout in seconds for the BFF Lambda function. API Gateway HTTP API integrations are capped at 30 seconds."
  type        = number
  default     = 30

  validation {
    condition     = var.lambda_timeout_seconds >= 1 && var.lambda_timeout_seconds <= 30
    error_message = "lambda_timeout_seconds must be between 1 and 30."
  }
}

variable "log_retention_in_days" {
  description = "CloudWatch Logs retention in days for API Gateway and Lambda logs."
  type        = number
  default     = 14

  validation {
    condition = contains([
      1,
      3,
      5,
      7,
      14,
      30,
      60,
      90,
      120,
      150,
      180,
      365,
      400,
      545,
      731,
      1096,
      1827,
      2192,
      2557,
      2922,
      3288,
      3653,
    ], var.log_retention_in_days)
    error_message = "log_retention_in_days must be a CloudWatch Logs supported retention value."
  }
}

variable "name_prefix" {
  description = "Prefix used for BFF resource names."
  type        = string
  default     = "wel-agents-bff"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.name_prefix))
    error_message = "name_prefix must be 3-32 lowercase alphanumeric or hyphen characters and start with a letter."
  }
}

variable "request_timeout_ms" {
  description = "Fetch timeout in milliseconds for the Lambda to AgentCore Runtime request."
  type        = number
  default     = 28000

  validation {
    condition     = var.request_timeout_ms >= 1000 && var.request_timeout_ms <= 29000
    error_message = "request_timeout_ms must be between 1000 and 29000."
  }
}

variable "tags" {
  description = "Tags applied to AWS resources that support tagging."
  type        = map(string)
  default = {
    Project   = "wel-agents-poc"
    Purpose   = "bff"
    ManagedBy = "terraform"
  }
}

variable "throttling_burst_limit" {
  description = "API Gateway default route throttling burst limit."
  type        = number
  default     = 20

  validation {
    condition     = var.throttling_burst_limit >= 1
    error_message = "throttling_burst_limit must be greater than or equal to 1."
  }
}

variable "throttling_rate_limit" {
  description = "API Gateway default route throttling rate limit per second."
  type        = number
  default     = 10

  validation {
    condition     = var.throttling_rate_limit >= 1
    error_message = "throttling_rate_limit must be greater than or equal to 1."
  }
}

variable "ws_url_expires_seconds" {
  description = "Expiration in seconds for AgentCore WebSocket presigned URLs issued by the BFF."
  type        = number
  default     = 300

  validation {
    condition     = var.ws_url_expires_seconds >= 30 && var.ws_url_expires_seconds <= 300
    error_message = "ws_url_expires_seconds must be between 30 and 300."
  }
}
