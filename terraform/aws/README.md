# terraform/aws

`wel-agents-poc` が利用する AWS リソースの Terraform 設定。

各 module の前提、手順、更新、cleanup は module 配下の README を正とします。このファイルは AWS 構成全体の入口と、module 間の依存順だけを扱います。

## 実行順

ブラウザから会話できる状態まで作る標準順は、module 間の output / input 依存に合わせて次の通りです。

1. [`agentcore/`](./agentcore/README.md) を作成し、`agent_runtime_arn` を取得する。
2. [`auth/`](./auth/README.md) を作成し、BFF 用の `bff_jwt_config` と Chat UI 用の `chat_ui_auth_env` を取得する。
3. [`bff/`](./bff/README.md) に `agent_runtime_arn` と `bff_jwt_config` を設定して作成し、`chat_ui_origin` を取得する。
4. [`chat-ui/`](./chat-ui/README.md) に `chat_ui_origin` を設定し、`chat_ui_auth_env` を build 時の `VITE_AUTH_*` に反映して作成する。

初回で Chat UI の CloudFront URL がまだ未確定の場合は、`auth/` を local callback URL だけで先に作成する。その後 `chat-ui/` を一度作成して `site_url` を取得し、`auth/` の `callback_urls` / `logout_urls` に `site_url` を追加して再 apply する。最後に `VITE_AUTH_REDIRECT_URI` を `site_url` に合わせて Chat UI を再 build / 再 apply する。

## 一括 apply / destroy

各 stack の `terraform.tfvars`・AWS 認証・container engine が揃った環境では、上記の手順を `mise` task で一括実行できる（実体は [`tools/tf/`](../../tools/tf)、完全非対話 `-auto-approve`、AWS CLI pager 無効化、開始時に AWS account / region を banner 表示する）。

- `mise run aws:apply` — `agentcore -> auth -> bff -> chat-ui` を依存順に適用する。各 stack の build（`build:bff` / `build:ui`）・agentcore の ECR への image build/push・vector KB ingestion 起動・support_activity SQL KB metadata ingestion 起動・上流 `terraform output` の `-var` / `VITE_AUTH_*` への注入まで含み、`auth <-> chat-ui` の循環は2パス目（`auth -> chat-ui` 再適用）で解消する。
- `mise run aws:destroy` — 逆順 `chat-ui -> bff -> auth -> agentcore` で破棄する。全 stateful リソースが `force_destroy` / `force_delete` / `deletion_protection=INACTIVE` のため手動の事前空化は不要。
- 単体は `mise run aws:apply:<stack>` / `mise run aws:destroy:<stack>`（上流 output を live read するため、失敗した stack だけ再実行できる）。

KB ingestion / metadata sync は `aws:apply` 内で fire-and-forget で起動するだけで完了は待たない。各 ingestion job が `COMPLETE` になるまで、その KB を引く専門 agent は文書や structured data metadata を見つけられない（手動手順と同じ）。
