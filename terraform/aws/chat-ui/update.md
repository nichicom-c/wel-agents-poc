# AgentCore Chat UI 更新（資産を更新したときの手順）

この module をデプロイ済みの状態で、React UI や CloudFront / BFF origin 設定を更新したときの手順。初回デプロイは
[`README.md`](./README.md#手順) を参照する。すべてリポジトリルートから実行する。

更新する資産は主に 2 種類あり、何を変えたかで追加操作が変わる。

| 更新した資産 | `bun run build:ui` | `terraform apply` | CloudFront invalidation |
| --- | :---: | :---: | :---: |
| (A) React UI（`packages/chat-ui/` / `package.json` / `bun.lock` / `tsconfig.json`） | [OK] | [OK] | 必要に応じて |
| (B) CloudFront / S3 / BFF origin 設定（`terraform.tfvars` / `*.tf`） | – | [OK] | 通常不要 |

## (A) React UI を更新

UI の source は `packages/chat-ui/`。Terraform は source ではなく `bun run build:ui` が生成する
`dist/chat-ui/` を S3 に upload する。`aws_s3_object.site` は `etag = filemd5(...)` で build 済み
asset の差分を検出する。

```bash
# 1) packages/chat-ui/ 配下の React app を編集

# 2) 品質ゲート（mise activate 済み前提。未活性なら各行に mise exec -- を前置）
bun run typecheck && bun run test && bun run check

# 3) 静的 asset を build
bun run build:ui

# 4) apply（変更/新規を S3 へ upload。削除も反映される）
mise exec -- terraform -chdir=terraform/aws/chat-ui fmt -check
mise exec -- terraform -chdir=terraform/aws/chat-ui validate
mise exec -- terraform -chdir=terraform/aws/chat-ui plan
mise exec -- terraform -chdir=terraform/aws/chat-ui apply

# 5) URL で確認
mise exec -- terraform -chdir=terraform/aws/chat-ui output -raw site_url
```

全 asset は `Cache-Control: no-cache` で upload する。即時反映が必要な場合は、apply 後に CloudFront
invalidation を実行する。

```bash
mise exec -- aws cloudfront create-invalidation \
  --distribution-id "$(mise exec -- terraform -chdir=terraform/aws/chat-ui output -raw cloudfront_distribution_id)" \
  --paths "/*"
```

## (B) CloudFront / S3 / BFF origin 設定を更新

`terraform.tfvars` の `api_origin_domain_name` / `api_origin_path`、または `*.tf` の CloudFront / S3
設定を変更した場合は plan の差分を確認してから apply する。

```bash
mise exec -- terraform -chdir=terraform/aws/chat-ui fmt -check
mise exec -- terraform -chdir=terraform/aws/chat-ui validate
mise exec -- terraform -chdir=terraform/aws/chat-ui plan   # 内容を必ず確認
mise exec -- terraform -chdir=terraform/aws/chat-ui apply
```

- `api_origin_domain_name` / `api_origin_path` は CloudFront の `/api/*` origin を変える設定。
- BFF を再作成して API Gateway endpoint が変わった場合は、`terraform/aws/bff` の
  `chat_ui_origin` output を `terraform.tfvars` に転記してから apply する。
- `price_class` や `error_document` など CloudFront distribution の設定変更は反映に数分かかることがある。

## 不要になったら

学習後の削除手順は [`cleanup.md`](./cleanup.md) を参照する。
