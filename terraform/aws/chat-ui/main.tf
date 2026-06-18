# Data sources:
# 現在 Terraform が使っている AWS account と region を読み取り、bucket 名の組み立てに利用する。
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
