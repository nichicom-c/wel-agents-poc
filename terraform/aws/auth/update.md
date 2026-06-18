# Auth (Cognito) 更新（設定を更新したときの手順）

この module をデプロイ済みの状態で、Cognito の設定を更新したときの手順。初回デプロイは
[`README.md`](./README.md#手順) を参照する。すべてリポジトリルートから実行する。

| 更新した設定 | 影響 | 後続作業 |
| --- | --- | --- |
| `callback_urls` / `logout_urls` | App Client のみ更新 | chat-ui の `VITE_AUTH_REDIRECT_URI` と一致を確認 |
| `allowed_oauth_scopes` | App Client のみ更新 | chat-ui の `VITE_AUTH_SCOPE` と一致を確認 |
| `*_token_validity_*` | App Client のみ更新 | なし |
| `name_prefix` / `domain_prefix` | **User Pool / domain が再作成** → `user_pool_id` が変わる | `bff` と `chat-ui` を再配線・再 apply |

```bash
mise exec -- terraform -chdir=terraform/aws/auth fmt -check
mise exec -- terraform -chdir=terraform/aws/auth validate
mise exec -- terraform -chdir=terraform/aws/auth plan   # 内容を必ず確認
mise exec -- terraform -chdir=terraform/aws/auth apply
```

## issuer / client が変わった場合の再配線

`user_pool_id` または App Client ID が変わると `jwt_issuer` / `jwt_audience` / `VITE_AUTH_*` が変わる。

```bash
# BFF を再配線して apply
mise exec -- terraform -chdir=terraform/aws/auth output bff_jwt_config
# → terraform/aws/bff/terraform.tfvars の jwt_issuer / jwt_audience を更新
mise exec -- terraform -chdir=terraform/aws/bff plan
mise exec -- terraform -chdir=terraform/aws/bff apply

# chat-ui を再 build / 再デプロイ（VITE_AUTH_* を反映）
mise exec -- terraform -chdir=terraform/aws/auth output chat_ui_auth_env
# → VITE_AUTH_* を設定して bun run build:ui → terraform/aws/chat-ui を apply
```

## 不要になったら

学習後の削除手順は [`cleanup.md`](./cleanup.md) を参照する。
