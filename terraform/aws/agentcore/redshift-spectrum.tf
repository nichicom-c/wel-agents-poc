# --- Redshift Spectrum query engine for support activity SQL KB ---
# Redshift Serverless は Bedrock SQL Knowledge Base の query engine。Spectrum external schema で Glue Catalog tables backed by S3 Parquet を読む。

resource "aws_redshiftserverless_namespace" "support_activity" {
  namespace_name        = local.support_activity.redshift_namespace_name
  db_name               = local.support_activity.redshift_database_name
  manage_admin_password = true
  default_iam_role_arn  = aws_iam_role.redshift_spectrum.arn
  iam_roles             = [aws_iam_role.redshift_spectrum.arn]
  tags                  = var.tags
}

resource "aws_redshiftserverless_workgroup" "support_activity" {
  workgroup_name      = local.support_activity.redshift_workgroup_name
  namespace_name      = aws_redshiftserverless_namespace.support_activity.namespace_name
  base_capacity       = 8
  max_capacity        = 8
  publicly_accessible = false
  tags                = var.tags

  depends_on = [aws_redshiftserverless_namespace.support_activity]
}

resource "aws_redshiftdata_statement" "support_activity_external_schema" {
  workgroup_name = aws_redshiftserverless_workgroup.support_activity.workgroup_name
  database       = aws_redshiftserverless_namespace.support_activity.db_name
  secret_arn     = aws_redshiftserverless_namespace.support_activity.admin_password_secret_arn
  statement_name = "${var.name_prefix}-support-activity-external-schema"
  sql            = <<-SQL
    CREATE EXTERNAL SCHEMA IF NOT EXISTS ${local.support_activity.redshift_external_schema}
    FROM DATA CATALOG
    DATABASE '${aws_glue_catalog_database.support_activity.name}'
    REGION '${data.aws_region.current.region}'
    IAM_ROLE '${aws_iam_role.redshift_spectrum.arn}';
  SQL

  depends_on = [
    aws_glue_catalog_table.support_activity,
    aws_lakeformation_permissions.support_activity_data_location,
    aws_lakeformation_permissions.support_activity_database,
    aws_lakeformation_permissions.support_activity_tables,
    aws_iam_role_policy.redshift_spectrum,
  ]
}

resource "aws_redshiftdata_statement" "support_activity_kb_iam_user_procedure" {
  workgroup_name = aws_redshiftserverless_workgroup.support_activity.workgroup_name
  database       = aws_redshiftserverless_namespace.support_activity.db_name
  secret_arn     = aws_redshiftserverless_namespace.support_activity.admin_password_secret_arn
  statement_name = "${var.name_prefix}-support-activity-kb-iam-user-procedure"
  sql            = <<-SQL
    CREATE OR REPLACE PROCEDURE ${local.support_activity_kb_redshift_user_procedure_name}()
    AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_user
        WHERE usename = '${local.support_activity_kb_redshift_user_name}'
      ) THEN
        EXECUTE 'CREATE USER "${local.support_activity_kb_redshift_user_name}" WITH PASSWORD DISABLE';
      ELSE
        EXECUTE 'ALTER USER "${local.support_activity_kb_redshift_user_name}" PASSWORD DISABLE';
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  SQL

  depends_on = [
    aws_iam_role.support_activity_kb_service,
    aws_redshiftserverless_workgroup.support_activity,
  ]
}

resource "aws_redshiftdata_statement" "support_activity_kb_iam_user" {
  workgroup_name = aws_redshiftserverless_workgroup.support_activity.workgroup_name
  database       = aws_redshiftserverless_namespace.support_activity.db_name
  secret_arn     = aws_redshiftserverless_namespace.support_activity.admin_password_secret_arn
  statement_name = "${var.name_prefix}-support-activity-kb-iam-user"
  sql            = "CALL ${local.support_activity_kb_redshift_user_procedure_name}();"

  depends_on = [
    aws_redshiftdata_statement.support_activity_kb_iam_user_procedure,
  ]
}

resource "aws_redshiftdata_statement" "support_activity_kb_awsdatacatalog_grant" {
  workgroup_name = aws_redshiftserverless_workgroup.support_activity.workgroup_name
  database       = aws_redshiftserverless_namespace.support_activity.db_name
  secret_arn     = aws_redshiftserverless_namespace.support_activity.admin_password_secret_arn
  statement_name = "${var.name_prefix}-support-activity-kb-awsdatacatalog-grant"
  sql            = "GRANT USAGE ON DATABASE ${local.support_activity.glue_catalog_name} TO \"${local.support_activity_kb_redshift_user_name}\";"

  depends_on = [aws_redshiftdata_statement.support_activity_kb_iam_user]
}
