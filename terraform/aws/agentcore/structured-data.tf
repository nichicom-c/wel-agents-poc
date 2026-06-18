# --- Structured data store: support activity ---
# Bedrock SQL Knowledge Base の storage side。committed synthetic Parquet files を Glue Data Catalog tables として定義し、Redshift Spectrum / Bedrock から参照する。

resource "aws_glue_catalog_database" "support_activity" {
  name        = local.support_activity.glue_database_name
  description = "Synthetic support activity structured data sample for Bedrock SQL Knowledge Base."
}

resource "aws_glue_catalog_table" "support_activity" {
  for_each = local.support_activity_tables

  name          = each.key
  database_name = aws_glue_catalog_database.support_activity.name
  description   = each.value.description
  table_type    = "EXTERNAL_TABLE"

  parameters = {
    EXTERNAL       = "TRUE"
    classification = "parquet"
    source         = "wel-agents-poc synthetic support activity sample"
  }

  storage_descriptor {
    location      = "s3://${aws_s3_bucket.data.bucket}/${local.support_activity.parquet_prefix}/${each.key}/"
    input_format  = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"

    ser_de_info {
      name                  = "${each.key}-parquet-serde"
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
    }

    dynamic "columns" {
      for_each = each.value.columns

      content {
        name    = columns.value.name
        type    = columns.value.type
        comment = columns.value.description
      }
    }
  }

  depends_on = [aws_s3_object.data]
}

resource "aws_lakeformation_resource" "support_activity_parquet" {
  arn                     = local.support_activity.lakeformation_resource_path
  use_service_linked_role = true
}

resource "aws_lakeformation_permissions" "support_activity_data_location" {
  for_each = local.support_activity_lakeformation_data_principals

  principal   = each.value
  permissions = ["DATA_LOCATION_ACCESS"]

  data_location {
    arn = aws_lakeformation_resource.support_activity_parquet.arn
  }
}

resource "aws_lakeformation_permissions" "support_activity_database" {
  for_each = local.support_activity.lakeformation_principals

  principal   = each.value
  permissions = ["DESCRIBE"]

  database {
    name = aws_glue_catalog_database.support_activity.name
  }
}

resource "aws_lakeformation_permissions" "support_activity_tables" {
  for_each = local.support_activity_lakeformation_table_permissions

  principal   = each.value.principal
  permissions = ["DESCRIBE", "SELECT"]

  table {
    database_name = aws_glue_catalog_database.support_activity.name
    name          = each.value.table_name
  }

  depends_on = [aws_glue_catalog_table.support_activity]
}

resource "aws_bedrockagent_knowledge_base" "support_activity" {
  name        = "${var.name_prefix}-support-activity"
  description = "SQL Knowledge Base over synthetic municipal support activity structured data."
  role_arn    = aws_iam_role.support_activity_kb_service.arn

  knowledge_base_configuration {
    type = "SQL"

    sql_knowledge_base_configuration {
      type = "REDSHIFT"

      redshift_configuration {
        query_engine_configuration {
          type = "SERVERLESS"

          serverless_configuration {
            workgroup_arn = aws_redshiftserverless_workgroup.support_activity.arn

            auth_configuration {
              type = "IAM"
            }
          }
        }

        storage_configuration {
          type = "AWS_DATA_CATALOG"

          aws_data_catalog_configuration {
            table_names = local.support_activity.glue_table_qualified_names
          }
        }

        query_generation_configuration {
          execution_timeout_seconds = local.support_activity.query_timeout_seconds

          generation_context {
            dynamic "table" {
              for_each = local.support_activity_tables

              content {
                name        = local.support_activity_query_table_refs[table.key]
                description = table.value.description
                inclusion   = "INCLUDE"

                dynamic "column" {
                  for_each = table.value.columns

                  content {
                    name        = column.value.name
                    description = column.value.description
                    inclusion   = "INCLUDE"
                  }
                }
              }
            }

            dynamic "curated_query" {
              for_each = local.support_activity_curated_queries

              content {
                natural_language = curated_query.value.natural_language
                sql              = curated_query.value.sql
              }
            }
          }
        }
      }
    }
  }

  tags = var.tags

  depends_on = [
    aws_iam_role_policy.support_activity_kb_service,
    aws_redshiftdata_statement.support_activity_kb_awsdatacatalog_grant,
    aws_redshiftdata_statement.support_activity_external_schema,
    aws_lakeformation_permissions.support_activity_database,
    aws_lakeformation_permissions.support_activity_tables,
  ]
}

resource "aws_bedrockagent_data_source" "support_activity_metadata" {
  knowledge_base_id = aws_bedrockagent_knowledge_base.support_activity.id
  name              = local.support_activity.metadata_data_source_name
  description       = "Redshift metadata source for support_activity SQL Knowledge Base."

  data_source_configuration {
    type = "REDSHIFT_METADATA"
  }
}
