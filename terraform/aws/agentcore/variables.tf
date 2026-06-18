variable "name_prefix" {
  description = "AgentCore / Knowledge Base / S3 / ECR / IAM の名前に使う小文字の prefix。長くすると S3 bucket 名が 63 文字上限に近づく点に注意。"
  type        = string
  default     = "wel-agents-rag"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}[a-z0-9]$", var.name_prefix))
    error_message = "name_prefix は 3〜32文字の小文字・数字・ハイフンで構成し、英小文字で始まり、末尾をハイフンにできません。"
  }
}

variable "model_id" {
  description = "supervisor / 専門 agent が使う Amazon Bedrock generation model ID。ローカルの terraform.tfvars に設定し、実値は commit しない。"
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.model_id)) > 0
    error_message = "model_id は空にできません。"
  }
}

variable "agent_image_uri" {
  description = "AgentCore Runtime が使うコンテナイメージ URI。空なら本 module が作る ECR repository の <url>:<image_tag> を使う。事前に build & push しておくこと。"
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "agent_image_uri 未指定時に、本 module の ECR repository へ付与・参照するイメージタグ。"
  type        = string
  default     = "latest"
}

variable "enable_lakeformation_data_grants" {
  description = "support_activity SQL KB / Redshift Spectrum role へ Lake Formation DATA_LOCATION_ACCESS と table SELECT / DESCRIBE を明示 grant するか。Terraform 実行 principal が Lake Formation data lake admin か、対象 data location / table の grant 権限を持つ場合だけ true にする。"
  type        = bool
  default     = false
}

variable "embedding_model_id" {
  description = "Knowledge Base の埋め込みに使う Amazon Bedrock embedding model ID。embedding_dimensions と整合する model を指定する。"
  type        = string
  default     = "amazon.titan-embed-text-v2:0"

  validation {
    condition     = length(trimspace(var.embedding_model_id)) > 0
    error_message = "embedding_model_id は空にできません。"
  }
}

variable "embedding_dimensions" {
  description = "埋め込みベクトルの次元数。Knowledge Base 側と S3 Vectors index 側で一致させる（titan-embed-text-v2 は 256 / 512 / 1024）。"
  type        = number
  default     = 1024

  validation {
    condition     = var.embedding_dimensions > 0 && var.embedding_dimensions <= 4096
    error_message = "embedding_dimensions は 1〜4096 の範囲で指定する（S3 Vectors の上限）。"
  }
}

variable "kb_number_of_results" {
  description = "各専門 agent の KB retrieval で取得するチャンク数（runtime の KB_NUMBER_OF_RESULTS に渡す）。"
  type        = number
  default     = 5

  validation {
    condition     = var.kb_number_of_results > 0
    error_message = "kb_number_of_results は 1 以上で指定する。"
  }
}

variable "event_expiry_duration" {
  description = "AgentCore Memory が会話 event (short-term) を保持する日数 (7〜365)。"
  type        = number
  default     = 30

  validation {
    condition     = var.event_expiry_duration >= 7 && var.event_expiry_duration <= 365
    error_message = "event_expiry_duration は 7〜365 の範囲で指定する。"
  }
}

variable "bedrock_model_resource_arns" {
  description = "runtime role が invoke できる generation model の resource ARN。default の wildcard は PoC の portability 向けで、production では絞り込む。"
  type        = list(string)
  default     = ["*"]

  validation {
    condition     = length(var.bedrock_model_resource_arns) > 0
    error_message = "bedrock_model_resource_arns は 1件以上指定する。"
  }
}

variable "tags" {
  description = "この PoC が作成するリソースに付与する tag。"
  type        = map(string)
  default = {
    Project   = "wel-agents-poc"
    Purpose   = "agentcore"
    ManagedBy = "terraform"
  }
}
