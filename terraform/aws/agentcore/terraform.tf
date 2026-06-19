# Provider requirements:
# この module が必要とする Terraform 本体と provider を宣言する。AgentCore / Knowledge Base /
# S3 Vectors / OpenSearch Serverless の resource を含むため、それらに対応する provider を exact pin する。
terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.50.0"
    }

    opensearch = {
      source  = "opensearch-project/opensearch"
      version = "= 2.3.2"
    }

    time = {
      source  = "hashicorp/time"
      version = "= 0.14.0"
    }
  }
}
