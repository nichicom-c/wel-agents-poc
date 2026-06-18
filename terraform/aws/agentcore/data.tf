# --- Knowledge Base data source (S3) ---
# 各ドメインの文書と support_activity synthetic structured data を 1 つの bucket に prefix 分けで置く。
# vector Knowledge Base の data source は inclusion_prefixes で自分のドメイン prefix だけを取り込む
# （knowledge-bases.tf）。support_activity は Glue table の storage_descriptor.location が
# structured-data/support-activity/parquet/<table>/ を指し、SQL KB の metadata sync は REDSHIFT_METADATA
# data source で起動する。いずれも WEL-MOTHER 実データではない。

resource "aws_s3_bucket" "data" {
  bucket = local.data_bucket_name
  # PoC なので destroy 時に中身ごと消せるようにする（取り込み済みのサンプル文書のみ）。
  force_destroy = true
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 暗号化を IaC 上で明示する（現行 S3 の既定も SSE-S3 だが方針をコードで強制する）。
# SSE-S3 (AES256) を使うため KMS 権限は不要。KMS-CMK 化する場合は kb_service role に kms:Decrypt を追加する。
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# data/ 配下をすべて upload する。key は data/ からの相対 path となる。law-manifests/ ·
# medical-care-law-manifests/ は ingestion 対象 prefix の外側に置かれる review manifest。structured-data/ は
# SQL Knowledge Base / Redshift Spectrum 向けの synthetic CSV / Parquet。
resource "aws_s3_object" "data" {
  for_each = fileset("${path.module}/data", "**/*")

  bucket = aws_s3_bucket.data.id
  key    = each.value
  source = "${path.module}/data/${each.value}"
  etag   = filemd5("${path.module}/data/${each.value}")
  tags   = var.tags
}
