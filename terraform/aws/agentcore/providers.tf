# Provider configuration:
# region・認証情報は AWS provider の標準の仕組み（環境変数 / shared config / profile など）から
# 解決する。provider block 内に secret や machine-local な値は書かない。
provider "aws" {}
