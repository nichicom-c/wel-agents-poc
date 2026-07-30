# AgentCore BFF 更新（資産を更新したときの手順）

この module をデプロイ済みの状態で、Lambda handler や BFF 設定を更新したときの手順。初回デプロイは
[`README.md`](./README.md#手順) を参照する。すべてリポジトリルートから実行する。

更新する資産は主に 3 種類あり、何を変えたかで build の要否が変わる。

| 更新した資産 | `bun run build:bff` | `terraform apply` | `chat-ui` 再 apply |
| --- | :---: | :---: | :---: |
| (A) Lambda package の入力（`packages/bff/` / `package.json` / `bun.lock` / `tsconfig.json`） | [OK] | [OK] | 通常不要 |
| (B) BFF 設定（`agent_runtime_arn` / `agent_runtime_qualifier` / CORS / timeout ほか） | – | [OK] | API endpoint が変わった場合のみ |
| (C) Training Data Store のスキーマ（`terraform/aws/bff/migrations/*.sql`、issue #8/#9/#10） | – | 新規リソース追加時のみ | 不要 |

## (A) Lambda package の入力を更新

Lambda にデプロイする handler は `bun run build:bff` で `packages/bff/lambda.ts` から
`dist/bff-lambda/index.mjs` に bundle する。Terraform は `archive_file` data source で zip を作り、
`source_code_hash` で Lambda package の差分を検出する。

```bash
# 0) 品質ゲート（mise activate 済み前提。未活性なら各行に mise exec -- を前置）
bun run typecheck && bun run test && bun run check

# 1) Lambda artifact を再 build
bun run build:bff

# 2) apply（source_code_hash の差分で Lambda が更新される）
mise exec -- terraform -chdir=terraform/aws/bff fmt -check
mise exec -- terraform -chdir=terraform/aws/bff validate
mise exec -- terraform -chdir=terraform/aws/bff plan
mise exec -- terraform -chdir=terraform/aws/bff apply

# 3) BFF を確認
curl -s "$(mise exec -- terraform -chdir=terraform/aws/bff output -raw ping_endpoint)"
curl -s "$(mise exec -- terraform -chdir=terraform/aws/bff output -raw chat_endpoint)" \
  -H "content-type: application/json" \
  -d '{"message":"Amazon S3 とは何ですか？","conversationId":"chat-00000000-0000-4000-8000-000000000000"}'
```

`dist/` は生成物なのでコミットしない。

## (B) BFF 設定を更新

`terraform.tfvars` の `agent_runtime_arn` / `agent_runtime_qualifier`、または `*.tf` の Lambda / API
Gateway / IAM / CORS / timeout 設定を変更した場合は plan の差分を確認してから apply する。

```bash
mise exec -- terraform -chdir=terraform/aws/bff fmt -check
mise exec -- terraform -chdir=terraform/aws/bff validate
mise exec -- terraform -chdir=terraform/aws/bff plan   # 内容を必ず確認
mise exec -- terraform -chdir=terraform/aws/bff apply
```

- AgentCore Runtime のコンテナを同じ `agent_runtime_arn` / `agent_runtime_qualifier` のまま更新しただけなら、
  BFF の再 build / apply は不要。
- `agent_runtime_arn` を別 runtime へ向ける場合は apply で Lambda 環境変数と IAM policy が更新される。
- API Gateway が再作成されて endpoint が変わった場合は、`chat_ui_origin` output を
  `terraform/aws/chat-ui/terraform.tfvars` に転記して `chat-ui` を再 apply する。

```bash
mise exec -- terraform -chdir=terraform/aws/bff output chat_ui_origin
mise exec -- terraform -chdir=terraform/aws/chat-ui plan
mise exec -- terraform -chdir=terraform/aws/chat-ui apply
```

## (C) Training Data Store のスキーマを更新

`terraform/aws/bff/migrations/` に新しい番号（`0003_...sql` 等）の SQL ファイルを追加した場合、
Terraform apply は不要（migration ファイル自体はどの `.tf` からも参照されない）。追加した
ファイルだけを再実行する。

```bash
eval "$(mise exec -- terraform -chdir=terraform/aws/bff output -raw training_data_migrate_command)"
```

`tools/db-migrate/run-migrations.ts` は対象 DB の `schema_migrations` テーブルを見て未適用のファイル
だけを版番号順に適用するため、既存分を再実行しても影響しない。既存の migration ファイルの内容を
書き換えるのではなく、常に新しい番号のファイルを追加する（適用済みファイルは再実行されないため、
書き換えても反映されない）。

## 不要になったら

学習後の削除手順は [`cleanup.md`](./cleanup.md) を参照する。
