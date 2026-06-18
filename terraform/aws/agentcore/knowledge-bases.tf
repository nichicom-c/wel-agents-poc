# --- Vector store (S3 Vectors) ---
# 1 つの vector bucket に、ドメインごとの index を作る（local.domains の数だけ）。各 Knowledge Base は
# 自分の index を storage に使う（field_mapping 不要・index_arn だけで紐づく点が OpenSearch Serverless
# との違い）。
resource "aws_s3vectors_vector_bucket" "this" {
  vector_bucket_name = local.vector_bucket_name
  # PoC なので destroy 時に index ごと消せるようにする。
  force_destroy = true
  tags          = var.tags
}

resource "aws_s3vectors_index" "this" {
  for_each = local.domains

  index_name         = "${var.name_prefix}-${each.value.prefix}"
  vector_bucket_name = aws_s3vectors_vector_bucket.this.vector_bucket_name

  # data_type は小文字 float32 / dimension は単数形。embedding 側 dimensions と一致させる。
  data_type       = "float32"
  dimension       = var.embedding_dimensions
  distance_metric = "cosine"

  tags = var.tags
}

# --- Knowledge Bases ---
# ドメインごとに VECTOR タイプの Knowledge Base を作成し、storage に S3 Vectors index を使う。
resource "aws_bedrockagent_knowledge_base" "this" {
  for_each = local.domains

  name     = "${var.name_prefix}-${each.value.prefix}"
  role_arn = aws_iam_role.kb_service.arn

  knowledge_base_configuration {
    type = "VECTOR"

    vector_knowledge_base_configuration {
      embedding_model_arn = local.embedding_model_arn

      embedding_model_configuration {
        bedrock_embedding_model_configuration {
          # dimensions は複数形・FLOAT32 は大文字。index 側 dimension と一致させる。
          dimensions          = var.embedding_dimensions
          embedding_data_type = "FLOAT32"
        }
      }
    }
  }

  storage_configuration {
    type = "S3_VECTORS"

    s3_vectors_configuration {
      index_arn = aws_s3vectors_index.this[each.key].index_arn
    }
  }

  tags = var.tags

  # KB 作成時に service role が embedding model / S3 Vectors にアクセスできるよう、
  # role policy の attach を先行させる。
  depends_on = [aws_iam_role_policy.kb_service]
}

# --- Data sources (S3) ---
# 各 Knowledge Base に、共有 data bucket の自ドメイン prefix を data source として紐づける。
resource "aws_bedrockagent_data_source" "this" {
  for_each = local.domains

  knowledge_base_id = aws_bedrockagent_knowledge_base.this[each.key].id
  name              = "${var.name_prefix}-${each.value.prefix}-s3"

  data_source_configuration {
    type = "S3"

    s3_configuration {
      bucket_arn         = aws_s3_bucket.data.arn
      inclusion_prefixes = ["${each.value.prefix}/"]
    }
  }

  # ingestion 起動時に prefix が空にならないよう、サンプル文書の upload 完了を data source 作成より
  # 先行させる。
  depends_on = [aws_s3_object.data]
}
