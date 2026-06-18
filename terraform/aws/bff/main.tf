# Data sources:
# `bun run build:bff` で `packages/` から生成した Lambda deployment package を作成する。
data "archive_file" "lambda" {
  type        = "zip"
  output_path = "${path.module}/.terraform/${local.function_name}.zip"
  source_dir  = "${path.module}/../../../dist/bff-lambda"
}
