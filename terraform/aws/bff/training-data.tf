# --- Training Data Store（issue #8/#9/#10 の dummy データ実装を実 DB に切り替えるための土台）---
# Aurora Serverless v2 (PostgreSQL) + RDS Data API。docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md
# の検討に基づく。DB へのアクセスは BFF に閉じ、AgentCore は soap_draft / soap_gaps と同型の
# 無状態 agent のままにする方針のため、この module にだけ Aurora cluster を置く（`voice-capture.tf`
# と同じ「BFF が使うデータストアは bff module に置く」前例に従う）。
#
# 既定では作成しない（`enable_training_data_store = true` で opt-in）。issue #8/#9/#10 の UI は
# 現状 dummy データのみで、この DB へはまだ何も接続していないため、他の目的で bff stack を
# apply しただけで意図せず課金が始まらないようにする（`enable_law_hierarchical_comparison` と
# 同じ opt-in パターン）。

# `aws_vpc`（単数）data source は enableDnsHostnames 等の VPC 属性まで取得するため
# ec2:DescribeVpcAttribute 権限が追加で必要になる。VPC ID だけあればよいので、
# その呼び出しをしない `aws_vpcs`（複数形）を使う。
data "aws_vpcs" "default" {
  count = var.enable_training_data_store ? 1 : 0

  filter {
    name   = "isDefault"
    values = ["true"]
  }
}

# Aurora は（Redshift Serverless と異なり）default VPC でも subnet group の明示作成が必須。
data "aws_subnets" "default" {
  count = var.enable_training_data_store ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [local.training_data_default_vpc_id]
  }
}

resource "aws_db_subnet_group" "training_data" {
  count = var.enable_training_data_store ? 1 : 0

  name       = "${var.name_prefix}-training-data"
  subnet_ids = data.aws_subnets.default[0].ids
  tags       = var.tags
}

# Data API は HTTPS 経由（AWS API 越し）で呼ぶため、この SG へ ingress ルールは不要。
resource "aws_security_group" "training_data" {
  count = var.enable_training_data_store ? 1 : 0

  name        = "${var.name_prefix}-training-data"
  description = "Aurora Serverless v2 (training data store). No ingress; accessed only via RDS Data API."
  vpc_id      = local.training_data_default_vpc_id
  tags        = var.tags

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_rds_cluster" "training_data" {
  count = var.enable_training_data_store ? 1 : 0

  cluster_identifier     = local.training_data_cluster_identifier
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  engine_version         = var.training_data_engine_version
  database_name          = var.training_data_database_name
  master_username        = var.training_data_master_username
  db_subnet_group_name   = aws_db_subnet_group.training_data[0].name
  vpc_security_group_ids = [aws_security_group.training_data[0].id]

  # RDS が Secrets Manager に master password を発行・ローテーションする（tfvars / state に
  # 平文パスワードを持たない）。
  manage_master_user_password = true

  # Aurora Data API。BFF Lambda は VPC 外から HTTPS でこれを呼ぶ（VPC アタッチ不要）。
  enable_http_endpoint = true

  serverlessv2_scaling_configuration {
    min_capacity = var.training_data_min_acu
    max_capacity = var.training_data_max_acu
  }

  # PoC なので destroy 時にスナップショットを残さない。
  skip_final_snapshot = true
  # PoC なので誤操作で destroy できるようにする（本番運用に切り替える際は true にする）。
  deletion_protection = false

  tags = var.tags
}

resource "aws_rds_cluster_instance" "training_data" {
  count = var.enable_training_data_store ? 1 : 0

  identifier         = "${local.training_data_cluster_identifier}-1"
  cluster_identifier = aws_rds_cluster.training_data[0].id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.training_data[0].engine
  engine_version     = aws_rds_cluster.training_data[0].engine_version
  tags               = var.tags
}
