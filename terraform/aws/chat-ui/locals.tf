locals {
  api_origin_id     = "chat-api"
  bucket_name       = "${var.name_prefix}-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"
  distribution_name = "${var.name_prefix}-distribution"
  s3_origin_id      = "chat-ui-s3"
  site_source_dir   = abspath("${path.module}/../../../dist/chat-ui")
  site_files        = fileset(local.site_source_dir, "**/*")

  content_types = {
    ".css"  = "text/css; charset=utf-8"
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
  }
}
