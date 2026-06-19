# agentcore cleanup

この module は AgentCore Runtime / endpoint / Memory、4つの S3 Vectors backed vector Knowledge Base、`law_hierarchical` OpenSearch Serverless backed Knowledge Base、support_activity SQL Knowledge Base、S3 Vectors の vector bucket と4つの index、OpenSearch Serverless collection / vector index、Redshift Serverless namespace / workgroup、Glue Data Catalog database / tables、Lake Formation sample S3 prefix registration / database permission、data source 用 S3 bucket / objects、ECR repository / images、IAM role / policy を作成する。`enable_lakeformation_data_grants = true` の場合だけ Lake Formation data location / table permissions も作成する。学習後は `destroy` する。

> [INFO] AgentCore Runtime の作成時に AWS 側が暗黙の `DEFAULT` endpoint（version 1 を指す）を生成する。
> 本 module は別途 `sample` endpoint を作り、invoke は `sample` qualifier を使う。`DEFAULT` endpoint は
> runtime の内在 sub-resource なので、`aws_bedrockagentcore_agent_runtime` を destroy すれば一緒に削除される。

## 削除前に確認

```bash
mise exec -- terraform -chdir=terraform/aws/agentcore state list
mise exec -- terraform -chdir=terraform/aws/agentcore plan -destroy
```

## 削除

```bash
mise exec -- terraform -chdir=terraform/aws/agentcore destroy
```

`data` bucket・S3 Vectors の vector bucket・ECR repository は `force_destroy` / `force_delete = true` のため、取り込み済みのサンプル文書・support_activity synthetic CSV / Parquet・ベクトル・push 済みイメージごと削除できる。`law_hierarchical` の OpenSearch vector index は `force_destroy = true`、OpenSearch Serverless collection / policy も Terraform state 管理下なので、通常は同じ `destroy` で削除される。Redshift Serverless / Glue resources と Lake Formation resources も Terraform state 管理下なので、通常は同じ `destroy` で削除される。

## destroy が失敗した場合

- AgentCore Runtime / endpoint / Memory の作成・削除直後は AWS 側の eventual consistency で一時的に
  失敗することがある。数分待って再実行する。
- Knowledge Base ingestion で作成されたベクトルは S3 Vectors index 内にある。`destroy` は index と
  vector bucket（`force_destroy = true`）を削除するため通常はそのまま消えるが、index 削除が依存関係で
  詰まる場合は数分待って再実行する。
- `law_hierarchical` の OpenSearch Serverless collection / index は access policy 反映や index deletion の eventual consistency で一時的に失敗することがある。数分待って再実行し、残った場合は OpenSearch Serverless console で collection / index の状態を確認する。
- ECR repository に手動 push したイメージは Terraform 管理外。`force_delete = true` のため repository
  ごと削除されるが、別 repository を手動作成した場合は手動削除する。
- Redshift Serverless workgroup / namespace の削除が進まない場合は、SQL 実行中の statement や AWS 側の eventual consistency を疑い、数分待って再実行する。
- Lake Formation の data location / permissions が手動で変更されていると destroy 時に依存関係で失敗することがある。Terraform が管理する対象は sample S3 prefix、sample Glue database / tables、sample IAM roles に限定される。
- Bedrock model access（generation / embedding）はこの Terraform では作成・削除しない。不要になった
  model access の扱いは AWS account の運用方針に従う。
- ingestion job 自体は履歴として残ることがあるが課金対象のリソースではない。
