output "bucket_name" {
  description = "Name of the private S3 bucket that stores the static UI."
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for the chat UI."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "site_url" {
  description = "HTTPS URL for the deployed static chat UI."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}
