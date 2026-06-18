# agentcore 更新（資産を更新したときの手順）

この module をデプロイ済みの状態で、資産を更新したときの手順。初回デプロイは
[`README.md`](./README.md#手順) を参照する。すべてリポジトリルートから実行する。

更新する資産は 3 種類あり、何を変えたかで実行すべき操作が変わる。

| 更新した資産 | build & push | `terraform apply` | ingestion 再実行 |
| --- | :---: | :---: | :---: |
| (A) コンテナイメージの入力（`packages/` / `Dockerfile.agentcore` / `package.json` / `bun.lock` / `tsconfig.json`） | [OK] 新タグで | [OK] | – |
| (B) vector ナレッジ文書 `data/<domain>/`（KB ソース） | – | [OK] | [OK] |
| (B2) support_activity structured data `data/structured-data/support-activity/` | – | [OK] | – |
| (C) env 系設定（`model_id` / `kb_number_of_results` ほか） | – | [OK] | – |
| (C) embedding 設定（`embedding_model_id` / `embedding_dimensions`） | – | [OK]（index / KB 再作成） | [OK] 全 KB |

## (A) コンテナイメージの入力を更新（`packages/` / `Dockerfile.agentcore` / 依存ほか）

イメージに焼き込まれる入力 — エージェントコード `packages/`・`Dockerfile.agentcore`・依存
（`package.json` / `bun.lock`）・`tsconfig.json` — のいずれを変えても、Dockerfile の builder stage が
`packages/agentcore/index.ts` を build した artifact の中身が変わるため、手順は同じ「再 build → 新タグで push → apply」
になる。`packages/` を触っていなくても (A) として扱う。

runtime が参照するイメージは `container_uri = "<ecr-url>:<image_tag>"`（`locals.tf`）。Terraform は
このタグ文字列しか追跡せず Dockerfile やコードの差分は見ないため、下記の通り**毎回タグを上げる**こと。

> [WARNING] `image_tag` を `latest` のまま再 push しても runtime は更新されない。`container_uri` が
> 同じ固定文字列のままで Terraform が差分を検知せず `UpdateAgentRuntime` が走らないため。AgentCore は
> デプロイ時点のイメージを保持し続ける。**コード更新ごとに一意なタグへ上げる**こと。

> [INFO] `mise run aws:apply[:agentcore]`（`tools/tf/apply-stack.sh`）を使う場合、この「一意なタグへ上げる」は自動化されている。image 入力（`packages/agentcore` / `Dockerfile.agentcore` / `package.json` / `bun.lock` / `tsconfig.json`）の内容ハッシュ `img-<hash>` を算出し `-var image_tag=...` で渡すため、入力が変われば新タグ＝新 version、変わらなければ再デプロイされない（未コミット変更も working-tree を hash するので反映される）。タグが既に ECR にあれば build/push も skip する。以下の手動手順は orchestration を使わず手で apply する場合のもの。

`build_push_commands` output は「直近 apply 済みの `image_tag`」を反映するため、新タグでの push には
不変の repository URL を使う（output はまだ新タグを知らない）。

```bash
# 0) 品質ゲート（mise activate 済み前提。未活性なら各行に mise exec -- を前置）
bun run typecheck && bun run test && bun run check

# 1) 新しいタグを決める（例。ECR repository URL と region は不変）
TAG=2026-06-14-1
ECR=$(mise exec -- terraform -chdir=terraform/aws/agentcore output -raw ecr_repository_url)
REGION=$(mise exec -- terraform -chdir=terraform/aws/agentcore output -raw region)

# 2) build & push（新タグ・ARM64 必須）
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR%/*}"
docker build --platform linux/arm64 -f Dockerfile.agentcore -t "${ECR}:${TAG}" .
docker push "${ECR}:${TAG}"

# 3) terraform.tfvars の image_tag を同じ値へ更新（image_tag = "2026-06-14-1"）

# 4) apply（container_uri のタグが変わり runtime が新バージョンへ更新される）
mise exec -- terraform -chdir=terraform/aws/agentcore plan
mise exec -- terraform -chdir=terraform/aws/agentcore apply

# 5) invoke で確認
mise exec -- terraform -chdir=terraform/aws/agentcore output -raw invoke_command
```

### `sample` endpoint のバージョン追従

runtime を更新すると新しい `agent_runtime_version` が作られる。`main.tf` では endpoint の
`agent_runtime_version` を runtime の最新（`aws_bedrockagentcore_agent_runtime.this.agent_runtime_version`）へ
紐づけているため、**apply だけで invoke 先の `sample`（`invoke_command` の `--qualifier 'sample'`）も
新バージョンへ追従する**（AWS 暗黙の `DEFAULT` endpoint も最新へ自動追従する）。この紐づけが無いと
endpoint は作成時の version に固定され、イメージを push・apply しても旧コードを実行し続ける。

> [INFO] 2026-06-15 の実 apply で、runtime 更新後に `aws_bedrockagentcore_agent_runtime_endpoint.sample`
> も同じ apply 内で更新されることを確認済み。更新後は `invoke_command` の実行結果、または
> `aws bedrock-agentcore-control get-agent-runtime-endpoint`（`live_version`）で配信バージョンを確認する。
> 万一固定されたままなら手動で repoint する（正確なフラグは
> `aws bedrock-agentcore-control update-agent-runtime-endpoint help` で確認し、`--agent-runtime-version` を
> 新バージョンへ向ける。新バージョン番号は
> `aws bedrock-agentcore-control get-agent-runtime --agent-runtime-id <id>` で確認する）。

### `Dockerfile.agentcore` を変えたときの追加確認

`bun run typecheck / test / check` はソースのみを検証し Dockerfile は検証しない。Dockerfile を変えた
ときはローカルで実際に build・起動して `/ping` 契約を確認する（darwin / Apple Silicon なら linux/arm64
はネイティブで動く）。

```bash
docker build --platform linux/arm64 -f Dockerfile.agentcore -t agentcore-smoke .
docker run --rm -p 8080:8080 agentcore-smoke &
curl -fsS localhost:8080/ping
```

> [INFO] Dockerfile の Bun イメージ（`oven/bun:1.3.14`）を変える場合は、`mise.toml` の `[tools].bun` と
> 同じ値へ**同時に**更新する（Dockerfile は `mise.toml` を読めないため両方を手で揃える）。

## (B) vector ナレッジ文書（`data/`）を更新

Vector KB の文書は `data/<domain>/` 配下（`database/` · `document/` · `law/` · `medical-care-law/`）。
`aws_s3_object.data` が `etag = filemd5(...)` で差分管理する（`data.tf`）。`law/` · `medical-care-law/` の
corpus は手編集せず generator で再生成する：`law/` の児童虐待防止法 corpus は
`bun run law:generate:child-abuse-prevention`（`tools/law-rag/`、e-Gov 法令 API v2）、`medical-care-law/` の
保険診療基本法令テキストブック OCR corpus は `bun run medical-care-law:generate:textbook`
（`tools/medical-care-law-rag/`、要 tesseract jpn language data）で生成する。`data/law-manifests/` ·
`data/medical-care-law-manifests/` は監査・OCR review 用 manifest で、各ドメイン prefix 外のため
ingestion されない（bucket には upload される）。

```bash
# 1) data/<domain>/ 配下のファイルを編集・追加・削除

# 2) apply（変更/新規を S3 へ upload。削除も反映される）
mise exec -- terraform -chdir=terraform/aws/agentcore plan
mise exec -- terraform -chdir=terraform/aws/agentcore apply

# 3) ingestion 再実行（apply はベクトル化しない＝Terraform 管理外）
mise exec -- terraform -chdir=terraform/aws/agentcore output start_ingestion_commands
#  → 出力された各 aws bedrock-agent start-ingestion-job ... を実行
#    （差分取り込み：追加/更新/削除が S3 Vectors index に反映される）

# 4) COMPLETE 待ち
aws bedrock-agent list-ingestion-jobs \
  --knowledge-base-id <kb-id> --data-source-id <ds-id> --region <region>

# 5) invoke で確認（COMPLETE まで該当 agent は新文書を引けない）
```

> [INFO] 実データ（repo 外の資料）を S3 へ直接置く運用なら Terraform は関与しない。S3 へ upload →
> ingestion 起動の 2 ステップだけになる（コンテナ再 build も apply も不要）。

## (B2) support_activity structured data を更新

support_activity は Bedrock SQL Knowledge Base なので vector embedding は作らないが、SQL 生成用の schema metadata ingestion は必要。source of truth は `tools/structured-data/generate-support-activity-sample.ts` で、review 用 CSV と Redshift Spectrum query 用 Parquet を同じ synthetic records から生成する。

```bash
# 1) synthetic data を再生成（CSV mirror + Parquet）
bun run structured-data:generate:support-activity

# 2) generator tests と型検査
bun test tools/structured-data/generate-support-activity-sample.test.ts
bun run typecheck

# 3) apply（S3 object etag、Glue table metadata、Redshift external schema、SQL KB metadata data source を反映）
#    metadata ingestion 起動まで wrapper が行う。
mise run aws:apply:agentcore

# 4) metadata ingestion COMPLETE 待ち後に SQL KB retrieve smoke
mise exec -- terraform -chdir=terraform/aws/agentcore output -raw support_activity_retrieve_command
```

Redshift Spectrum は Glue table の `storage_descriptor.location` が指す S3 Parquet prefix を読むため、Parquet file を差し替えたら apply で S3 object を更新すればよい。table schema や curated query を変える場合は `locals.tf` / `structured-data.tf` も同時に更新し、`terraform validate` と `plan` を確認する。schema metadata を KB に反映するには、apply wrapper が起動する support_activity metadata ingestion が `COMPLETE` になるまで待つ。

## (C) 設定（`terraform.tfvars` / `*.tf`）を更新

```bash
mise exec -- terraform -chdir=terraform/aws/agentcore fmt -check
mise exec -- terraform -chdir=terraform/aws/agentcore validate
mise exec -- terraform -chdir=terraform/aws/agentcore plan   # 内容を必ず確認
mise exec -- terraform -chdir=terraform/aws/agentcore apply
```

- `model_id` / `kb_number_of_results` は `runtime_env`（`locals.tf`）経由で runtime に渡るため、apply で
  環境変数が更新される。**イメージ再 build は不要。**
- [WARNING] `embedding_model_id` / `embedding_dimensions` の変更は S3 Vectors index と Knowledge Base の
  **再作成**を誘発する破壊的変更。全ドメインで (B) の再 ingestion が必須。必ず `plan` の
  `# forces replacement` を確認してから apply する。

## 不要になったら

学習後の削除手順は [`cleanup.md`](./cleanup.md) を参照する。
