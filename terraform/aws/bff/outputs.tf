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
