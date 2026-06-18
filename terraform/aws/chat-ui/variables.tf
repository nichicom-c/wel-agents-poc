variable "api_origin_domain_name" {
  description = "BFF origin domain for /api/*, without scheme or path."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9.-]+$", var.api_origin_domain_name))
    error_message = "api_origin_domain_name must be a domain name without scheme or path."
  }
}

variable "api_origin_path" {
  description = "Optional origin path for the BFF, such as an API Gateway stage path."
  type        = string
  default     = ""

  validation {
    condition     = var.api_origin_path == "" || can(regex("^/[A-Za-z0-9/_-]*$", var.api_origin_path))
    error_message = "api_origin_path must be empty or start with / and contain only letters, numbers, underscore, or hyphen path segments."
  }
}

variable "error_document" {
  description = "Static asset used for CloudFront 403/404 fallback responses."
  type        = string
  default     = "index.html"
}

variable "force_destroy" {
  description = "Whether Terraform may delete the S3 bucket even when it contains uploaded UI assets."
  type        = bool
  default     = true
}

variable "index_document" {
  description = "Default root object served by CloudFront."
  type        = string
  default     = "index.html"
}

variable "name_prefix" {
  description = "Prefix used for the S3 bucket and CloudFront distribution names."
  type        = string
  default     = "wel-agents-chat-ui"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.name_prefix))
    error_message = "name_prefix must be 3-32 lowercase alphanumeric or hyphen characters and start with a letter."
  }
}

variable "price_class" {
  description = "CloudFront price class for the distribution."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "tags" {
  description = "Tags applied to AWS resources that support tagging."
  type        = map(string)
  default = {
    Project   = "wel-agents-poc"
    Purpose   = "chat-ui"
    ManagedBy = "terraform"
  }
}
