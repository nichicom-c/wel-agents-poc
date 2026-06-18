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
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${var.name_prefix}-lambda-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}
