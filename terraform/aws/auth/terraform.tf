# Provider requirements:
# この module が必要とする Terraform 本体と AWS provider を宣言する。Cognito User Pool / App Client /
# Hosted UI domain の resource を含むため、他 module と同じ AWS provider を exact pin する。
terraform {
  required_version = ">= 1.14.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.50.0"
    }
  }
}
