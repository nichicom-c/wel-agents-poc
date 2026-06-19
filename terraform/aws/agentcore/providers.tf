# Provider configuration:
# region・認証情報は AWS provider の標準の仕組み（環境変数 / shared config / profile など）から
# 解決する。provider block 内に secret や machine-local な値は書かない。
provider "aws" {}

# OpenSearch Serverless の vector index 作成に使う。collection endpoint は Terraform が作る
# `law_hierarchical` collection を参照し、AWS 認証は環境変数 / shared config / profile から解決する。
provider "opensearch" {
  url               = aws_opensearchserverless_collection.law_hierarchical.collection_endpoint
  aws_region        = data.aws_region.current.region
  sign_aws_requests = true
  healthcheck       = false
}
