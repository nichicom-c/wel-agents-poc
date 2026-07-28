# --- Voice Capture (issue #7) 音声原本 + 文字起こし結果の保存先 ---
# recordingId が S3 key prefix (recordings/<id>/...) と Amazon Transcribe の job name を兼ねるため、
# 状態管理用の DB は置かず、この bucket と Transcribe の job status だけで完結させる。

resource "aws_s3_bucket" "voice_capture" {
  bucket = local.voice_capture_bucket_name
  # PoC なので destroy 時に中身ごと消せるようにする。
  force_destroy = true
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "voice_capture" {
  bucket = aws_s3_bucket.voice_capture.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 音声原本・文字起こし結果は個人の記録素材なので、既定の SSE-S3 に加えて IaC 上で明示的に強制する。
resource "aws_s3_bucket_server_side_encryption_configuration" "voice_capture" {
  bucket = aws_s3_bucket.voice_capture.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# --- Amazon Transcribe 用の data access role ---
# Forward Access Sessions（呼び出し元 IAM principal の権限をそのまま使う既定の仕組み）だけでは
# アカウントによっては S3 アクセスが `BadRequestException: The specified S3 bucket can't be accessed`
# になることが実機検証で確認できたため、StartTranscriptionJob の JobExecutionSettings.DataAccessRoleArn
# に明示的に渡す専用 role を用意する（AWS 公式ドキュメントの trust policy / bucket policy 例に準拠）。
data "aws_iam_policy_document" "voice_capture_transcribe_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["transcribe.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.agent_runtime_account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:${local.agent_runtime_partition}:transcribe:${local.agent_runtime_region}:${local.agent_runtime_account_id}:*"]
    }
  }
}

resource "aws_iam_role" "voice_capture_transcribe" {
  name               = "${var.name_prefix}-voicecapture-transcribe-role"
  assume_role_policy = data.aws_iam_policy_document.voice_capture_transcribe_assume_role.json
  tags               = var.tags
}

data "aws_iam_policy_document" "voice_capture_transcribe_s3" {
  statement {
    sid    = "ReadVoiceCaptureInput"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.voice_capture.arn,
      "${aws_s3_bucket.voice_capture.arn}/*",
    ]
  }

  statement {
    sid       = "WriteVoiceCaptureOutput"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.voice_capture.arn}/*"]
  }
}

resource "aws_iam_role_policy" "voice_capture_transcribe" {
  name   = "${var.name_prefix}-voicecapture-transcribe-policy"
  role   = aws_iam_role.voice_capture_transcribe.id
  policy = data.aws_iam_policy_document.voice_capture_transcribe_s3.json
}
