# --- law_hierarchical Knowledge Base (OpenSearch Serverless + HIERARCHICAL chunking) ---
# 既存 law KB (S3 Vectors) は通常 runtime 用に維持し、同じ law/ prefix を別 KB に取り込んで
# chunking strategy / vector store の差分を比較できるようにする。

locals {
  law_hierarchical = {
    key                  = "law_hierarchical"
    collection_name      = substr("${var.name_prefix}-lawhier", 0, 32)
    collection_policy_id = substr("${var.name_prefix}-lawhier", 0, 23)
    vector_index_name    = "${substr("${var.name_prefix}-lawhier", 0, 32)}-index"
    vector_field         = "embedding"
    text_field           = "text"
    metadata_field       = "bedrock_metadata"
  }

  law_hierarchical_opensearch_principals = distinct(compact([
    data.aws_caller_identity.current.arn,
    data.aws_iam_session_context.current.issuer_arn,
    aws_iam_role.kb_service.arn,
  ]))

  law_hierarchical_vector_index_mappings = jsonencode({
    properties = {
      (local.law_hierarchical.vector_field) = {
        type      = "knn_vector"
        dimension = var.embedding_dimensions
        method = {
          name       = "hnsw"
          engine     = "faiss"
          space_type = "cosinesimil"
          parameters = {
            ef_construction = 512
            m               = 16
          }
        }
      }
      (local.law_hierarchical.text_field) = {
        type = "text"
      }
      (local.law_hierarchical.metadata_field) = {
        type  = "text"
        index = false
      }
    }
  })
}

resource "aws_opensearchserverless_security_policy" "law_hierarchical_encryption" {
  name = "${local.law_hierarchical.collection_policy_id}-enc"
  type = "encryption"
  policy = jsonencode({
    Rules = [
      {
        ResourceType = "collection"
        Resource     = ["collection/${local.law_hierarchical.collection_name}"]
      },
    ]
    AWSOwnedKey = true
  })
}

resource "aws_opensearchserverless_security_policy" "law_hierarchical_network" {
  name = "${local.law_hierarchical.collection_policy_id}-net"
  type = "network"
  policy = jsonencode([
    {
      Rules = [
        {
          ResourceType = "collection"
          Resource     = ["collection/${local.law_hierarchical.collection_name}"]
        },
        {
          ResourceType = "dashboard"
          Resource     = ["collection/${local.law_hierarchical.collection_name}"]
        },
      ]
      AllowFromPublic = true
    },
  ])
}

resource "aws_opensearchserverless_collection" "law_hierarchical" {
  name        = local.law_hierarchical.collection_name
  description = "Vector search collection for law hierarchical chunking comparison."
  type        = "VECTORSEARCH"

  # PoC の比較用なので standby replica は無効化してコストを抑える。
  standby_replicas = "DISABLED"
  tags             = var.tags

  depends_on = [
    aws_opensearchserverless_security_policy.law_hierarchical_encryption,
    aws_opensearchserverless_security_policy.law_hierarchical_network,
  ]
}

resource "aws_opensearchserverless_access_policy" "law_hierarchical_data" {
  name = "${local.law_hierarchical.collection_policy_id}-data"
  type = "data"
  policy = jsonencode([
    {
      Rules = [
        {
          ResourceType = "index"
          Resource     = ["index/${aws_opensearchserverless_collection.law_hierarchical.name}/*"]
          Permission = [
            "aoss:CreateIndex",
            "aoss:DeleteIndex",
            "aoss:DescribeIndex",
            "aoss:ReadDocument",
            "aoss:UpdateIndex",
            "aoss:WriteDocument",
          ]
        },
        {
          ResourceType = "collection"
          Resource     = ["collection/${aws_opensearchserverless_collection.law_hierarchical.name}"]
          Permission = [
            "aoss:CreateCollectionItems",
            "aoss:DeleteCollectionItems",
            "aoss:DescribeCollectionItems",
            "aoss:UpdateCollectionItems",
          ]
        },
      ]
      Principal = local.law_hierarchical_opensearch_principals
    },
  ])
}

resource "time_sleep" "law_hierarchical_wait_for_data_access_policy" {
  depends_on      = [aws_opensearchserverless_access_policy.law_hierarchical_data]
  create_duration = "60s"
}

resource "opensearch_index" "law_hierarchical" {
  name                           = local.law_hierarchical.vector_index_name
  number_of_shards               = "1"
  number_of_replicas             = "1"
  index_knn                      = true
  index_knn_algo_param_ef_search = "512"
  mappings                       = local.law_hierarchical_vector_index_mappings
  force_destroy                  = true

  depends_on = [time_sleep.law_hierarchical_wait_for_data_access_policy]
}

resource "aws_bedrockagent_knowledge_base" "law_hierarchical" {
  name        = "${var.name_prefix}-law-hierarchical"
  description = "law corpus comparison KB using OpenSearch Serverless and HIERARCHICAL chunking."
  role_arn    = aws_iam_role.kb_service.arn

  knowledge_base_configuration {
    type = "VECTOR"

    vector_knowledge_base_configuration {
      embedding_model_arn = local.embedding_model_arn

      embedding_model_configuration {
        bedrock_embedding_model_configuration {
          dimensions          = var.embedding_dimensions
          embedding_data_type = "FLOAT32"
        }
      }
    }
  }

  storage_configuration {
    type = "OPENSEARCH_SERVERLESS"

    opensearch_serverless_configuration {
      collection_arn    = aws_opensearchserverless_collection.law_hierarchical.arn
      vector_index_name = opensearch_index.law_hierarchical.name

      field_mapping {
        vector_field   = local.law_hierarchical.vector_field
        text_field     = local.law_hierarchical.text_field
        metadata_field = local.law_hierarchical.metadata_field
      }
    }
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy.kb_service,
    opensearch_index.law_hierarchical,
  ]
}

resource "aws_bedrockagent_data_source" "law_hierarchical" {
  knowledge_base_id = aws_bedrockagent_knowledge_base.law_hierarchical.id
  name              = "${var.name_prefix}-law-hierarchical-s3"

  data_source_configuration {
    type = "S3"

    s3_configuration {
      bucket_arn         = aws_s3_bucket.data.arn
      inclusion_prefixes = ["${local.domains.law.prefix}/"]
    }
  }

  vector_ingestion_configuration {
    chunking_configuration {
      chunking_strategy = "HIERARCHICAL"

      hierarchical_chunking_configuration {
        overlap_tokens = var.law_hierarchical_overlap_tokens

        level_configuration {
          max_tokens = var.law_hierarchical_parent_max_tokens
        }

        level_configuration {
          max_tokens = var.law_hierarchical_child_max_tokens
        }
      }
    }
  }

  depends_on = [aws_s3_object.data]
}
