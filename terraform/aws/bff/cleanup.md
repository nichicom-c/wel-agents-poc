# AgentCore BFF cleanup

この module は API Gateway HTTP API、Lambda、CloudWatch Logs、Lambda 実行 IAM role / policy、API Gateway
から Lambda への invoke permission を作成する。`enable_training_data_store = true` の場合は Aurora
Serverless v2 (PostgreSQL) + RDS Data API（issue #8/#9/#10 用）も作成する。学習後は `destroy` する。

静的 UI 配信は [`../chat-ui`](../chat-ui)、AgentCore Runtime 本体は
[`../agentcore`](../agentcore) が管理する。

## 削除前に確認

```bash
mise exec -- terraform -chdir=terraform/aws/bff state list
mise exec -- terraform -chdir=terraform/aws/bff plan -destroy
```

## 削除

```bash
mise exec -- terraform -chdir=terraform/aws/bff destroy
```

## destroy が失敗した場合

- Lambda / API Gateway / IAM の削除直後は AWS 側の eventual consistency で一時的に失敗することがある。
  数分待って再実行する。
- `chat-ui` がこの BFF の API Gateway endpoint を CloudFront origin に設定したままの場合、BFF 削除後は
  `/api/*` request が失敗する。UI も不要なら [`../chat-ui/cleanup.md`](../chat-ui/cleanup.md) の手順で削除する。
  UI を残す場合は、新しい BFF origin を `chat-ui` に設定して apply する。
- AgentCore Runtime は module 外のため削除されない。不要な場合は
  [`../agentcore/cleanup.md`](../agentcore/cleanup.md) の手順で別途削除する。
- `dist/bff-lambda/` や `.terraform/*.zip` はローカル生成物であり、AWS resource ではない。
- Training Data Store（`enable_training_data_store = true` の場合）だけを検証終了時に止めたいなら、
  `terraform.tfvars` を `enable_training_data_store = false` に戻して `apply` すれば Aurora cluster /
  subnet group / security group だけを destroy できる（BFF 本体は残る）。`skip_final_snapshot = true` /
  `deletion_protection = false` にしているため、destroy 時にスナップショットは残らない（PoC 前提。
  データを残したい場合は destroy 前に手動でスナップショットを取得する）。
