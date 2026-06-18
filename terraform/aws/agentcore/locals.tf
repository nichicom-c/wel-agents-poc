locals {
  # 複数の専門ドメイン。
  #   key         = アプリ側の専門 agent 識別子（runtime 環境変数のキーにも対応）
  #   prefix      = S3 オブジェクトのプレフィックス / index 名 / data source の inclusion prefix
  #   description = リソースの説明に使う
  domains = {
    database         = { prefix = "database", description = "Sample business data (customers / orders / products)" }
    document         = { prefix = "document", description = "Internal documents, policies, and FAQs" }
    law              = { prefix = "law", description = "Japanese law corpus (児童虐待防止法 PoC)" }
    medical_care_law = { prefix = "medical-care-law", description = "Medical care insurance law textbook corpus" }
  }

  # bucket 名は account / region を含めて衝突を避ける（name_prefix を長くすると 63 文字上限に近づく）。
  data_bucket_name   = "${var.name_prefix}-data-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"
  vector_bucket_name = "${var.name_prefix}-vectors-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.region}"

  # embedding model の ARN（account 部分は空：foundation model は account 非依存）。
  embedding_model_arn = "arn:aws:bedrock:${data.aws_region.current.region}::foundation-model/${var.embedding_model_id}"

  support_activity = {
    key                         = "support_activity"
    prefix                      = "structured-data/support-activity"
    parquet_prefix              = "structured-data/support-activity/parquet"
    glue_catalog_name           = "awsdatacatalog"
    glue_database_name          = replace("${var.name_prefix}_support_activity", "-", "_")
    redshift_database_name      = "support_activity"
    redshift_external_schema    = "support_activity_ext"
    redshift_namespace_name     = "${var.name_prefix}-support-activity"
    redshift_workgroup_name     = "${var.name_prefix}-support-activity"
    metadata_data_source_name   = "${var.name_prefix}-support-activity-metadata"
    query_timeout_seconds       = 30
    include_generated_sql       = false
    lakeformation_resource_path = "${aws_s3_bucket.data.arn}/structured-data/support-activity/parquet"
    lakeformation_principals = {
      redshift_spectrum           = aws_iam_role.redshift_spectrum.arn
      support_activity_kb_service = aws_iam_role.support_activity_kb_service.arn
    }
    glue_table_qualified_names = [for table_name in keys(local.support_activity_tables) : "${replace("${var.name_prefix}_support_activity", "-", "_")}.${table_name}"]
  }

  support_activity_tables = {
    resident_basic_ledger = {
      description = "Synthetic resident ledger rows keyed by resident_id and household_id. Contains coded age band, district, flags, and registration date; no names, addresses, phones, notes, or real WEL-MOTHER data."
      columns = [
        { name = "resident_id", type = "string", description = "Synthetic resident identifier such as res-0001." },
        { name = "household_id", type = "string", description = "Synthetic household identifier used to join households." },
        { name = "age_band", type = "string", description = "Coded age band: 0_17, 18_39, 40_64, 65_74, or 75_plus." },
        { name = "district_code", type = "string", description = "Synthetic district code." },
        { name = "household_role", type = "string", description = "Coded role within the household." },
        { name = "registered_on", type = "date", description = "Synthetic ledger registration date." },
        { name = "welfare_flag", type = "boolean", description = "Synthetic welfare support flag." },
        { name = "disability_flag", type = "boolean", description = "Synthetic disability support flag." },
        { name = "long_term_care_level", type = "bigint", description = "Synthetic long-term-care level code." },
        { name = "synthetic_marker", type = "string", description = "Always synthetic_only." },
      ]
    }
    households = {
      description = "Synthetic household attributes keyed by household_id. Contains coded household type, district, member count, minor flag, and income band."
      columns = [
        { name = "household_id", type = "string", description = "Synthetic household identifier." },
        { name = "household_type", type = "string", description = "Coded household type." },
        { name = "district_code", type = "string", description = "Synthetic district code." },
        { name = "member_count", type = "bigint", description = "Number of synthetic household members." },
        { name = "has_minor", type = "boolean", description = "Whether the household includes a minor in the synthetic sample." },
        { name = "income_band", type = "string", description = "Coded income band." },
        { name = "created_on", type = "date", description = "Synthetic household creation date." },
        { name = "synthetic_marker", type = "string", description = "Always synthetic_only." },
      ]
    }
    support_cases = {
      description = "Synthetic support case rows keyed by case_id and linked to resident_id. Contains case type, priority, status, team, and next action due date."
      columns = [
        { name = "case_id", type = "string", description = "Synthetic support case identifier." },
        { name = "resident_id", type = "string", description = "Synthetic resident identifier used to join resident_basic_ledger." },
        { name = "case_type", type = "string", description = "Coded support case type." },
        { name = "priority", type = "string", description = "Synthetic priority code: low, medium, or high." },
        { name = "status", type = "string", description = "Synthetic case status: open, monitoring, waiting, or closed." },
        { name = "opened_on", type = "date", description = "Synthetic case opened date." },
        { name = "closed_on", type = "date", description = "Synthetic case closed date when present." },
        { name = "assigned_team", type = "string", description = "Synthetic assigned support team code." },
        { name = "next_action_due_on", type = "date", description = "Synthetic next action due date when present." },
        { name = "synthetic_marker", type = "string", description = "Always synthetic_only." },
      ]
    }
    support_activity_logs = {
      description = "Synthetic support activity log rows keyed by activity_id and linked to case_id. Contains activity date, type, channel, outcome, minutes, and follow-up flag."
      columns = [
        { name = "activity_id", type = "string", description = "Synthetic support activity identifier." },
        { name = "case_id", type = "string", description = "Synthetic support case identifier used to join support_cases." },
        { name = "activity_on", type = "date", description = "Synthetic activity date." },
        { name = "activity_type", type = "string", description = "Coded activity type such as visit, phone_check, counter_consultation, document_review, or case_conference." },
        { name = "channel", type = "string", description = "Coded activity channel such as home_visit, phone, counter, backoffice, or online." },
        { name = "outcome_code", type = "string", description = "Coded activity outcome." },
        { name = "minutes_spent", type = "bigint", description = "Synthetic activity duration in minutes." },
        { name = "follow_up_required", type = "boolean", description = "Whether follow-up is required in the synthetic sample." },
        { name = "synthetic_marker", type = "string", description = "Always synthetic_only." },
      ]
    }
  }

  support_activity_query_table_refs = {
    for table_name in keys(local.support_activity_tables) :
    table_name => "${local.support_activity.glue_catalog_name}.${local.support_activity.glue_database_name}.${table_name}"
  }

  support_activity_kb_redshift_user_name           = "IAMR:${aws_iam_role.support_activity_kb_service.name}"
  support_activity_kb_redshift_user_procedure_name = "sp_${replace(var.name_prefix, "-", "_")}_support_activity_kb_user"

  support_activity_curated_queries = [
    {
      natural_language = "Count support cases by status."
      sql              = "SELECT status, COUNT(*) AS count FROM ${local.support_activity_query_table_refs["support_cases"]} GROUP BY status ORDER BY status"
    },
    {
      natural_language = "Count support activities by channel and total minutes."
      sql              = "SELECT channel, COUNT(*) AS count, SUM(minutes_spent) AS total_minutes FROM ${local.support_activity_query_table_refs["support_activity_logs"]} GROUP BY channel ORDER BY count DESC, channel"
    },
    {
      natural_language = "Show open high priority support cases with resident age band and district."
      sql              = "SELECT c.case_id, c.resident_id, r.age_band, r.district_code, c.case_type, c.status FROM ${local.support_activity_query_table_refs["support_cases"]} c JOIN ${local.support_activity_query_table_refs["resident_basic_ledger"]} r ON c.resident_id = r.resident_id WHERE c.priority = 'high' AND c.status <> 'closed' ORDER BY c.case_id"
    },
  ]

  support_activity_lakeformation_data_principals = var.enable_lakeformation_data_grants ? local.support_activity.lakeformation_principals : {}

  support_activity_lakeformation_table_permissions = {
    for permission in flatten([
      for principal_key, principal_arn in local.support_activity_lakeformation_data_principals : [
        for table_name in keys(local.support_activity_tables) : {
          key        = "${principal_key}.${table_name}"
          principal  = principal_arn
          table_name = table_name
        }
      ]
    ]) : permission.key => permission
  }

  # AgentCore の名前はハイフン不可（^[a-zA-Z][a-zA-Z0-9_]...）。prefix の "-" を "_" に変換する。
  runtime_name  = replace(var.name_prefix, "-", "_")
  memory_name   = "${replace(var.name_prefix, "-", "_")}_memory"
  endpoint_name = "sample"

  # TypeScript path はコンテナイメージを使う（Python の direct code ZIP は採用しない）。
  # agent_image_uri が空なら本 module の ECR repository の <url>:<image_tag> を参照する。
  container_uri = var.agent_image_uri != "" ? var.agent_image_uri : "${aws_ecr_repository.this.repository_url}:${var.image_tag}"

  # Runtime に渡す環境変数。app（packages/agentcore/config.ts）が読む名前と一致させる。
  runtime_env = {
    AWS_DEFAULT_REGION                     = data.aws_region.current.region
    BEDROCK_MODEL_ID                       = var.model_id
    DATABASE_KB_ID                         = aws_bedrockagent_knowledge_base.this["database"].id
    DOCUMENT_KB_ID                         = aws_bedrockagent_knowledge_base.this["document"].id
    LAW_KB_ID                              = aws_bedrockagent_knowledge_base.this["law"].id
    MEDICAL_CARE_LAW_KB_ID                 = aws_bedrockagent_knowledge_base.this["medical_care_law"].id
    SUPPORT_ACTIVITY_KB_ID                 = aws_bedrockagent_knowledge_base.support_activity.id
    SUPPORT_ACTIVITY_KB_ARN                = aws_bedrockagent_knowledge_base.support_activity.arn
    SUPPORT_ACTIVITY_INCLUDE_GENERATED_SQL = tostring(local.support_activity.include_generated_sql)
    AGENTCORE_MEMORY_ID                    = aws_bedrockagentcore_memory.this.id
    KB_NUMBER_OF_RESULTS                   = tostring(var.kb_number_of_results)
  }
}
