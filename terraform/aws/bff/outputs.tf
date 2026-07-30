output "api_endpoint" {
  description = "Base HTTPS endpoint for the BFF API Gateway HTTP API."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "api_id" {
  description = "API Gateway HTTP API ID."
  value       = aws_apigatewayv2_api.this.id
}

output "api_origin_domain_name" {
  description = "Domain name to set as chat-ui api_origin_domain_name."
  value       = replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "")
}

output "api_origin_path" {
  description = "Origin path to set as chat-ui api_origin_path."
  value       = ""
}

output "chat_endpoint" {
  description = "Full POST endpoint for browser chat requests."
  value       = "${aws_apigatewayv2_api.this.api_endpoint}/api/chat"
}

output "chat_ui_origin" {
  description = "Values to copy into terraform/aws/chat-ui/terraform.tfvars."
  value = {
    api_origin_domain_name = replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "")
    api_origin_path        = ""
  }
}

output "lambda_function_name" {
  description = "Lambda function name for the BFF."
  value       = aws_lambda_function.this.function_name
}

output "lambda_log_group_name" {
  description = "CloudWatch Logs group name for the Lambda function."
  value       = aws_cloudwatch_log_group.lambda.name
}

output "ping_endpoint" {
  description = "Health check endpoint for the BFF."
  value       = "${aws_apigatewayv2_api.this.api_endpoint}/ping"
}

output "voice_capture_bucket" {
  description = "S3 bucket storing Voice Capture audio originals and transcripts."
  value       = aws_s3_bucket.voice_capture.bucket
}

output "voice_capture_transcribe_role_arn" {
  description = "IAM role Amazon Transcribe assumes (via JobExecutionSettings.DataAccessRoleArn) to read/write the Voice Capture bucket."
  value       = aws_iam_role.voice_capture_transcribe.arn
}

output "training_data_cluster_arn" {
  description = "Aurora cluster ARN for the training data store (issue #8/#9/#10). Empty when enable_training_data_store is false."
  value       = var.enable_training_data_store ? aws_rds_cluster.training_data[0].arn : ""
}

output "training_data_secret_arn" {
  description = "Secrets Manager secret ARN holding the training data Aurora cluster's master credentials (RDS-managed). Empty when enable_training_data_store is false."
  value       = var.enable_training_data_store ? aws_rds_cluster.training_data[0].master_user_secret[0].secret_arn : ""
}

output "training_data_database_name" {
  description = "Initial database name on the training data Aurora cluster. Empty when enable_training_data_store is false."
  value       = var.enable_training_data_store ? aws_rds_cluster.training_data[0].database_name : ""
}

output "training_data_migrate_command" {
  description = "Copy-paste command to apply terraform/aws/bff/migrations/*.sql via tools/db-migrate against this cluster."
  value = var.enable_training_data_store ? join(" ", [
    "TRAINING_DATA_CLUSTER_ARN='${aws_rds_cluster.training_data[0].arn}'",
    "TRAINING_DATA_SECRET_ARN='${aws_rds_cluster.training_data[0].master_user_secret[0].secret_arn}'",
    "TRAINING_DATA_DATABASE_NAME='${aws_rds_cluster.training_data[0].database_name}'",
    "mise exec -- bun run training-data:migrate",
  ]) : ""
}
