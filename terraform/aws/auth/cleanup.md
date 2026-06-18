# Auth (Cognito) cleanup

この module は Cognito User Pool、Hosted UI domain、public App Client を作成する。学習後は `destroy` する。

BFF 本体は [`../bff`](../bff)、静的 UI 配信は [`../chat-ui`](../chat-ui)、AgentCore Runtime 本体は
[`../agentcore`](../agentcore) が管理する。

## 削除前に確認

```bash
mise exec -- terraform -chdir=terraform/aws/auth state list
mise exec -- terraform -chdir=terraform/aws/auth plan -destroy
```

## 削除

```bash
mise exec -- terraform -chdir=terraform/aws/auth destroy
```

`deletion_protection` を `"ACTIVE"` にしている場合は、先に `INACTIVE` へ変更して apply してから destroy する。

## destroy が失敗した場合

- User Pool にユーザーが残っていても prefix domain / client / pool は destroy できる。明示的にユーザーを
  消す場合は `aws cognito-idp admin-delete-user --user-pool-id <id> --username <name>` を使う。
- この IdP を参照している `bff`（JWT authorizer の `jwt_issuer` / `jwt_audience`）や `chat-ui`
  （`VITE_AUTH_*`）が残っていると、削除後はログイン / API 認証が失敗する。BFF も不要なら
  [`../bff/cleanup.md`](../bff/cleanup.md) の手順で削除する。続ける場合は新しい IdP の値を配線して apply する。
- 削除直後は AWS 側の eventual consistency で一時的に失敗することがある。数分待って再実行する。
