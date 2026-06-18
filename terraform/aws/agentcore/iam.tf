# =====================================================================
# (A) AgentCore Runtime 実行ロール
#   実行時に: ECR からのイメージ pull / CloudWatch Logs / generation model invoke /
#   Knowledge Base 検索 (bedrock:Retrieve) / AgentCore Memory の保存・取得。
#   ※ 検索 (query) 時の S3 Vectors アクセスは KB が KB service role で代行するため、
#     このロールに s3vectors 権限は付けない。
# =====================================================================

data "aws_iam_policy_document" "runtime_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["bedrock-agentcore.amazonaws.com"]
    }

    # confused-deputy 対策: 自 account かつ自 region の AgentCore からの assume に限定する。
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:bedrock-agentcore:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:*"]
    }
  }
}

resource "aws_iam_role" "runtime" {
  name               = "${var.name_prefix}-runtime-role"
  assume_role_policy = data.aws_iam_policy_document.runtime_assume_role.json
  tags               = var.tags
}

data "aws_iam_policy_document" "runtime" {
  statement {
    sid    = "EcrImagePull"
    effect = "Allow"
    actions = [
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [aws_ecr_repository.this.arn]
  }

  statement {
    sid       = "EcrAuthToken"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "WriteRuntimeLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/bedrock-agentcore/runtimes/*"]
  }

  statement {
    sid       = "DescribeRuntimeLogGroups"
    effect    = "Allow"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:*"]
  }

  statement {
    sid    = "InvokeBedrockModel"
    effect = "Allow"
    # Converse / ConverseStream は bedrock:InvokeModel / InvokeModelWithResponseStream で認可される
    # (bedrock:Converse という IAM action は存在しない)。
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = var.bedrock_model_resource_arns
  }

  statement {
    sid    = "RetrieveKnowledgeBases"
    effect = "Allow"
    # 検索は KB 経由 (bedrock:Retrieve)。KB が裏で s3vectors:QueryVectors を実行するため、
    # このロールに s3vectors は不要。
    actions = ["bedrock:Retrieve"]
    resources = concat(
      [for kb in aws_bedrockagent_knowledge_base.this : kb.arn],
      [aws_bedrockagent_knowledge_base.support_activity.arn],
    )
  }

  statement {
    sid    = "GenerateStructuredDataQuery"
    effect = "Allow"
    actions = [
      "bedrock:GetKnowledgeBase",
      "bedrock:GenerateQuery",
    ]
    resources = [aws_bedrockagent_knowledge_base.support_activity.arn]
  }

  statement {
    sid       = "GetSqlRecommendations"
    effect    = "Allow"
    actions   = ["sqlworkbench:GetSqlRecommendations"]
    resources = ["*"]
  }

  statement {
    sid    = "AgentCoreMemoryShortTerm"
    effect = "Allow"
    actions = [
      "bedrock-agentcore:CreateEvent",
      "bedrock-agentcore:GetEvent",
      "bedrock-agentcore:ListEvents",
    ]
    resources = [aws_bedrockagentcore_memory.this.arn]
  }
}

resource "aws_iam_role_policy" "runtime" {
  name   = "${var.name_prefix}-runtime-policy"
  role   = aws_iam_role.runtime.id
  policy = data.aws_iam_policy_document.runtime.json
}

# =====================================================================
# (B) Knowledge Base service role
#   Bedrock が assume し、ingestion / query 時に: embedding model invoke / S3 data source 読み取り /
#   S3 Vectors index への読み書き。
# =====================================================================

data "aws_iam_policy_document" "kb_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["bedrock.amazonaws.com"]
    }

    # confused-deputy 対策: 自 account かつ自分の Knowledge Base からの assume に限定。
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "AWS:SourceArn"
      values   = ["arn:aws:bedrock:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:knowledge-base/*"]
    }
  }
}

resource "aws_iam_role" "kb_service" {
  name               = "${var.name_prefix}-kb-service-role"
  assume_role_policy = data.aws_iam_policy_document.kb_assume_role.json
  tags               = var.tags
}

data "aws_iam_policy_document" "kb_service" {
  statement {
    # AWS 公式の KB service-role ポリシー例に含まれる model 列挙権限。resource 絞り込み不可のため "*"。
    sid    = "ListBedrockModels"
    effect = "Allow"
    actions = [
      "bedrock:ListFoundationModels",
      "bedrock:ListCustomModels",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "InvokeEmbeddingModel"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel"]
    resources = [local.embedding_model_arn]
  }

  statement {
    sid    = "ReadDataSourceBucket"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
    ]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/*",
    ]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid    = "ReadWriteS3VectorsIndexes"
    effect = "Allow"
    # ingestion (PutVectors) と query (QueryVectors。dependent action として GetVectors を要求) を
    # 各ドメインの index ARN にスコープする。
    actions = [
      "s3vectors:PutVectors",
      "s3vectors:GetVectors",
      "s3vectors:DeleteVectors",
      "s3vectors:QueryVectors",
      "s3vectors:GetIndex",
    ]
    resources = [for idx in aws_s3vectors_index.this : idx.index_arn]
  }
}

resource "aws_iam_role_policy" "kb_service" {
  name   = "${var.name_prefix}-kb-service-policy"
  role   = aws_iam_role.kb_service.id
  policy = data.aws_iam_policy_document.kb_service.json
}

# =====================================================================
# (C) support_activity SQL Knowledge Base service role
#   Bedrock が assume し、structured data store KB の Redshift query engine / Glue Catalog metadata
#   / Lake Formation data access を使う。
# =====================================================================

resource "aws_iam_role" "support_activity_kb_service" {
  name               = "${var.name_prefix}-support-activity-kb-role"
  assume_role_policy = data.aws_iam_policy_document.kb_assume_role.json
  tags               = var.tags
}

data "aws_iam_policy_document" "support_activity_kb_service" {
  statement {
    sid    = "UseRedshiftServerlessQueryEngine"
    effect = "Allow"
    actions = [
      "redshift-data:CancelStatement",
      "redshift-data:DescribeStatement",
      "redshift-data:ExecuteStatement",
      "redshift-data:GetStatementResult",
      "redshift-serverless:GetCredentials",
      "redshift-serverless:GetNamespace",
      "redshift-serverless:GetWorkgroup",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ReadGlueCatalogMetadata"
    effect = "Allow"
    actions = [
      "glue:GetDatabase",
      "glue:GetDatabases",
      "glue:GetTable",
      "glue:GetTables",
      "glue:GetPartition",
      "glue:GetPartitions",
    ]
    resources = concat(
      [
        "arn:aws:glue:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:catalog",
        "arn:aws:glue:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:database/${aws_glue_catalog_database.support_activity.name}",
      ],
      [
        for table_name in keys(local.support_activity_tables) :
        "arn:aws:glue:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.support_activity.name}/${table_name}"
      ],
    )
  }

  statement {
    sid    = "ReadStructuredDataParquet"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
    ]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/${local.support_activity.parquet_prefix}/*",
    ]
  }

  statement {
    sid       = "GetLakeFormationDataAccess"
    effect    = "Allow"
    actions   = ["lakeformation:GetDataAccess"]
    resources = ["*"]
  }

  statement {
    sid       = "GenerateStructuredDataQueries"
    effect    = "Allow"
    actions   = ["bedrock:GenerateQuery"]
    resources = ["*"]
  }

  statement {
    sid    = "ManageSqlGenerationContext"
    effect = "Allow"
    actions = [
      "sqlworkbench:DeleteSqlGenerationContext",
      "sqlworkbench:GetSqlGenerationContext",
      "sqlworkbench:GetSqlRecommendations",
      "sqlworkbench:PutSqlGenerationContext",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "support_activity_kb_service" {
  name   = "${var.name_prefix}-support-activity-kb-policy"
  role   = aws_iam_role.support_activity_kb_service.id
  policy = data.aws_iam_policy_document.support_activity_kb_service.json
}

# =====================================================================
# (D) Redshift Spectrum role
#   Redshift Serverless が assume し、Glue Catalog と S3 Parquet prefix を Spectrum external schema から読む。
# =====================================================================

data "aws_iam_policy_document" "redshift_spectrum_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type = "Service"
      identifiers = [
        "redshift.amazonaws.com",
        "redshift-serverless.amazonaws.com",
      ]
    }
  }
}

resource "aws_iam_role" "redshift_spectrum" {
  name               = "${var.name_prefix}-redshift-spectrum-role"
  assume_role_policy = data.aws_iam_policy_document.redshift_spectrum_assume_role.json
  tags               = var.tags
}

data "aws_iam_policy_document" "redshift_spectrum" {
  statement {
    sid    = "ReadStructuredDataParquet"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetObject",
    ]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/${local.support_activity.parquet_prefix}/*",
    ]
  }

  statement {
    sid    = "ReadGlueCatalogMetadata"
    effect = "Allow"
    actions = [
      "glue:GetDatabase",
      "glue:GetDatabases",
      "glue:GetTable",
      "glue:GetTables",
      "glue:GetPartition",
      "glue:GetPartitions",
    ]
    resources = concat(
      [
        "arn:aws:glue:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:catalog",
        "arn:aws:glue:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:database/${aws_glue_catalog_database.support_activity.name}",
      ],
      [
        for table_name in keys(local.support_activity_tables) :
        "arn:aws:glue:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.support_activity.name}/${table_name}"
      ],
    )
  }

  statement {
    sid       = "GetLakeFormationDataAccess"
    effect    = "Allow"
    actions   = ["lakeformation:GetDataAccess"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "redshift_spectrum" {
  name   = "${var.name_prefix}-redshift-spectrum-policy"
  role   = aws_iam_role.redshift_spectrum.id
  policy = data.aws_iam_policy_document.redshift_spectrum.json
}
