# Provider requirements:
# この module が必要とする Terraform 本体と AWS provider を宣言する。AgentCore / Knowledge Base /
# S3 Vectors の resource を含むため、それらに対応する近年の AWS provider を exact pin する。
terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.50.0"
    }
  }
}
