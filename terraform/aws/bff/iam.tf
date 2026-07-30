data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.name_prefix}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = var.tags
}

data "aws_iam_policy_document" "lambda" {
  statement {
    sid    = "WriteLambdaLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }

  statement {
    sid    = "InvokeAgentCoreRuntime"
    effect = "Allow"
    actions = [
      "bedrock-agentcore:InvokeAgentRuntime",
      "bedrock-agentcore:InvokeAgentRuntimeWithWebSocketStream",
    ]
    resources = [
      var.agent_runtime_arn,
      local.agent_runtime_endpoint_arn,
    ]
  }

  dynamic "statement" {
    for_each = local.agentcore_memory_arn != "" ? [local.agentcore_memory_arn] : []

    content {
      sid       = "ListAgentCoreMemorySessions"
      effect    = "Allow"
      actions   = ["bedrock-agentcore:ListSessions"]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = length(local.knowledge_base_arns) > 0 ? [local.knowledge_base_arns] : []

    content {
      sid    = "ReadKnowledgeBaseMetadata"
      effect = "Allow"
      actions = [
        "bedrock:GetKnowledgeBase",
        "bedrock:ListDataSources",
        "bedrock:ListKnowledgeBaseDocuments",
      ]
      resources = statement.value
    }
  }

  statement {
    sid    = "ReadWriteVoiceCaptureBucket"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
    ]
    resources = [
      aws_s3_bucket.voice_capture.arn,
      "${aws_s3_bucket.voice_capture.arn}/*",
    ]
  }

  statement {
    sid    = "RunVoiceCaptureTranscriptionJobs"
    effect = "Allow"
    actions = [
      "transcribe:StartTranscriptionJob",
      "transcribe:GetTranscriptionJob",
    ]
    # Transcribe の job 系 API は resource-level 権限をサポートしないため "*" が必須。
    resources = ["*"]
  }

  statement {
    sid    = "PassVoiceCaptureTranscribeRole"
    effect = "Allow"
    # Forward Access Sessions だけでは StartTranscriptionJob が S3 にアクセスできない
    # アカウントがあるため、JobExecutionSettings.DataAccessRoleArn に渡す専用 role を
    # Transcribe サービスにだけ pass できるようにする（voice-capture.tf 参照）。
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.voice_capture_transcribe.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["transcribe.amazonaws.com"]
    }
  }

  dynamic "statement" {
    for_each = var.enable_training_data_store ? [aws_rds_cluster.training_data[0].arn] : []

    content {
      sid    = "ExecuteTrainingDataStatements"
      effect = "Allow"
      actions = [
        "rds-data:ExecuteStatement",
        "rds-data:BatchExecuteStatement",
        "rds-data:BeginTransaction",
        "rds-data:CommitTransaction",
        "rds-data:RollbackTransaction",
      ]
      resources = [statement.value]
    }
  }

  dynamic "statement" {
    for_each = var.enable_training_data_store ? [aws_rds_cluster.training_data[0].master_user_secret[0].secret_arn] : []

    content {
      sid       = "ReadTrainingDataSecret"
      effect    = "Allow"
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [statement.value]
    }
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${var.name_prefix}-lambda-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}
