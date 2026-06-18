# terraform/gc

`wel-agents-poc` が利用する Google Cloud リソースの Terraform 設定。

> [INFO] **後日記載。** このディレクトリは現時点でプレースホルダーです。Google Cloud の Terraform 設定と利用方法は後日追記します。

## ステータス

- [ ] リソース / モジュール
- [ ] バックエンド・state 設定
- [ ] 変数・入力値
- [ ] apply / destroy 手順

## メモ

- `terraform` のツールバージョンは mise が `mise.toml` で固定しています。ルートの [`AGENTS.md`](../../AGENTS.md) を参照してください。
- Google Cloud の認証情報・設定はコードに含めず外部（環境変数または `*.local` ファイル）に置きます。シークレットや Terraform state は決してコミットしません。
