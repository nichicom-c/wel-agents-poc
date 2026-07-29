# packages/agentcore

`packages/agentcore` は Amazon Bedrock AgentCore Runtime として動く HTTP / WebSocket service です。user prompt / actor ID / session ID を取り出し、supervisor + 複数の専門 RAG agent を実行します。

公開する endpoint:

- `GET /ping` — health check
- `POST /invocations` — non-streaming JSON 応答用の互換 / fallback path
- `GET /ws` — WebSocket upgrade による streaming chat path（Chat UI の本線）

認証・URL 発行・HTTP contract 変換は `packages/bff` の責務で、本ディレクトリは AgentCore Runtime contract / WebSocket stream adapter / agent orchestration / Knowledge Base retrieval / Memory 連携を担います。

`POST /invocations` は payload の `type` フィールドで chat（supervisor、既定）、`soap_draft`（SOAP Studio の SOAP 下書き生成、issue #5）、`soap_gaps`（SOAP Studio の不足確認、issue #6）を振り分けます。`soap_draft` は supervisor の agents-as-tools 経路には乗らない独立した単発の分類 agent で、KB / Memory を使わず `BEDROCK_MODEL_ID` だけを必要とします。分類タスクは supervisor の会話より軽いことが多いため、任意の `SOAP_DRAFT_MODEL_ID` で専用 model ID に差し替えて応答時間を短縮できます（未設定時は `BEDROCK_MODEL_ID` にフォールバック）。記録種別（支援実績/汎用記録/会議/サマリー）は分類前の入力ではなく、分類後に入力テキスト全体（個々の候補ではない）に対する反映候補（`recommendedRecordTypes`、0個以上）として model が推薦する出力側の情報です。詳細は `application/soap-draft-agent.ts` / `application/build-soap-draft-response.ts` を参照してください。

`soap_gaps` は `soap_draft` の出力（SOAP 下書き候補）を受け取り、不足・曖昧・矛盾・根拠不足を検出して1問1意図の追加入力質問を返す単発パスです。検出は2段階です。まずルールベース（`domain/soap-gaps.ts`、字句・構造ベースの決定的なルールで AI を使わない。S/O の有無、P の日付/方法/担当者の欠落、固定キーワードの曖昧表現・対義語ペア、UNCLASSIFIED/低信頼度）で常に成功する不足一覧を作ります。次に、字句・構造だけでは拾えない意味的な不足（S/O の内容が A の結論を実際に支えているか、S/O の混在、字句一致しない矛盾、数値化されていない曖昧表現など）を別の AI（`application/soap-gaps-detection-agent.ts`）で追加検出し、ルールベースの結果と統合します（`domain/soap-gaps.ts` の `mergeGapLists`。同じ (gapType, soapCategory, targetItem) の重複はルールベース側を優先）。この検出 AI が `StructuredOutputError` で失敗してもルールベースの結果だけで継続します。統合した不足のうち必須不足・根拠不足・矛盾を優先した上位だけを、さらに別の AI（`application/soap-gaps-agent.ts`）に渡して自然な日本語の質問に変換します。この質問生成 AI が失敗しても fallback のテンプレート質問文で置き換えるため、不足一覧（`gaps`）自体はどちらの AI が失敗しても常に表示できます。両方の AI は任意の `SOAP_GAPS_MODEL_ID` で専用 model ID に差し替えられます（共有設定）。

## Entry Point

`index.ts` が AgentCore Runtime の root wrapper です。`adapters/http-server.ts` を公開し、`bun run build:agentcore` で `dist/agentcore/agentcore.mjs` に bundle されます。

AgentCore Runtime は source entrypoint が1つなので、root には用途名ではなく `index.ts` を置いています。複数の runtime entrypoint が増えた場合は、BFF と同じく用途名の wrapper に分けます。

## ローカル実行と env

ローカル実行は repo ルートから `mise run dev:agentcore`（packages/agentcore に cd して `bun index.ts`）で起動し、build 済み artifact は `mise run start:agentcore`（`dist/agentcore/agentcore.mjs`）で起動します。どちらも `packages/agentcore/.env` を読み込みます。

`packages/agentcore/.env.example` が local AgentCore Runtime 用の env を所有します。`.env` にコピーして値を埋めて使います（`.env` は gitignore 済み。`infra/config.ts` が読み取りを一元化します）。

Vector KB ID / support_activity SQL KB ID / Memory ID は `terraform -chdir=terraform/aws/agentcore output knowledge_base_ids`、`terraform -chdir=terraform/aws/agentcore output support_activity_knowledge_base_id`、`terraform -chdir=terraform/aws/agentcore output memory_id` の値を転記します。`LAW_HIERARCHICAL_KB_ID` は `law` corpus の chunking 比較用で、通常の `law_rag_agent` は引き続き `LAW_KB_ID` を使います。`SUPPORT_ACTIVITY_KB_ARN` は `SUPPORT_ACTIVITY_INCLUDE_GENERATED_SQL=true` で GenerateQuery debug output を使う場合だけ、`terraform -chdir=terraform/aws/agentcore output support_activity_knowledge_base_arn` の値を転記します。本番（AgentCore Runtime）は Terraform が `environment_variables` として供給するため、この `.env` はローカル実行専用です。

`packages/agentcore/.env` の KB ID / Memory ID は、`mise run dev:agentcore` / `mise run start:agentcore` で起動した local process が読むための値です。`bun run build:agentcore` や `Dockerfile.agentcore` の image build には取り込まれず、Terraform の deploy 環境にも反映されません。

`support_activity` は local / deployed runtime とも Terraform が作る Bedrock SQL Knowledge Base を `Retrieve` で引きます。DuckDB は `bun run structured-data:generate:support-activity` が committed synthetic CSV / Parquet を生成するためだけに使い、AgentCore Runtime には組み込みません。

deploy された AgentCore Runtime の env は Terraform 側の `terraform/aws/agentcore/locals.tf` の `local.runtime_env` が source of truth です。複数の専門 agent の Knowledge Base ID、support_activity SQL Knowledge Base ID / optional ARN、AgentCore Memory ID は Terraform が管理する `aws_bedrockagent_knowledge_base.this[...]` / `aws_bedrockagent_knowledge_base.support_activity` / `aws_bedrockagentcore_memory.this.id` から設定されるため、deploy 側の値を変える場合は `.env` ではなく Terraform 管理の resource / input / import 方針を変更します。

## Layers

| Path | Responsibility |
| --- | --- |
| `adapters/` | AgentCore Runtime の HTTP / WebSocket contract へ適合する層。`Bun.serve`、`/ping`、`/invocations`、`/ws` upgrade、binary JSON decode、WebSocket message validation、HTTP / WebSocket response 化、例外の封じ込めを担います。 |
| `application/` | Runtime の use case。設定確認、履歴取得、supervisor 実行 / stream 実行、stream event 変換、Memory 保存、specialist agent / tool 構成、model response からの本文抽出を担います。 |
| `contracts/` | Runtime request/response、WebSocket input/output event、adapter から application へ渡す `Responder` seam を定義します。 |
| `domain/` | Runtime payload に閉じた純粋なルール。prompt / actor / session の取り出しと、履歴付き supervisor message の組み立てを担います。 |
| `infra/` | AWS / Strands / env に接続する実装。Bedrock model、Knowledge Base Retrieve、support_activity structured-data providers、AgentCore Memory、runtime env config を担います。 |

## Dependency Direction

```mermaid
flowchart TD
  Entry["entrypoint<br/>index.ts"]
  Adapter["adapters<br/>Bun.serve / HTTP / WebSocket"]
  App["application<br/>/invocations response<br/>/ws stream"]
  Domain["domain<br/>prompt / actor / session rules"]
  Contracts["contracts<br/>Runtime payload / WebSocket events"]
  Agents["agent orchestration<br/>supervisor + multiple specialist RAG agents"]
  Infra["infra<br/>env / Bedrock / KB / Memory"]
  Aws["AWS services<br/>Bedrock / Knowledge Bases / AgentCore Memory"]

  Entry --> Adapter
  Adapter --> App
  Adapter --> Contracts
  App --> Domain
  App --> Contracts
  App --> Agents
  App --> Infra
  Agents --> Infra
  Infra --> Aws
```

依存の基本方針は、AgentCore HTTP / WebSocket contract を `adapters` に閉じ、会話処理を `application` に集約することです。`domain` は payload 由来の純粋な session rule、`contracts` は Runtime / WebSocket の data shape、`infra` は AWS SDK / Strands SDK / env に触れる実装だけを持ちます。

agent orchestration は `application` 配下にあり、supervisor と複数の専門 RAG agent を組み立てます。file 単位の詳細は、下の `Runtime Flows` と `File Map` を参照します。

## Runtime Flows

```mermaid
flowchart LR
  InvokeClient["BFF / smoke client"]
  Browser["Browser<br/>BFF-issued presigned URL"]
  Adapter["adapters/http-server.ts"]
  NonStream["buildResponse<br/>/invocations"]
  Stream["streamResponse<br/>/ws"]
  Core["shared runtime core<br/>session rules / config / Memory"]
  Supervisor["supervisor + multiple specialist RAG agents"]
  Infra["Bedrock model<br/>KB Retrieve / SQL KB Retrieve<br/>AgentCore Memory"]
  Json["RuntimeResponse JSON"]
  Events["ready / delta / tool_start<br/>tool_end / final / error"]

  InvokeClient -->|POST /invocations| Adapter
  Browser -->|GET /ws + user_message| Adapter
  Adapter --> NonStream
  Adapter --> Stream
  NonStream --> Core
  Stream --> Core
  Core --> Supervisor
  Supervisor --> Infra
  Core -.->|best-effort read / write| Infra
  Core -->|non-streaming| Json
  Core -->|streaming| Events
  Json --> Adapter --> InvokeClient
  Events --> Adapter --> Browser
```

`/invocations` と `/ws` は adapter で分岐しますが、prompt / actor / session の検証、env config、Memory、supervisor + 複数の専門 RAG agent は共通の runtime core を使います。違いは response shape で、`/invocations` は1つの JSON を返し、`/ws` は `ready`、`delta`、`tool_start`、`tool_end`、`final`、`error` の browser event を返します。Memory の読み書きは best-effort で、失敗しても会話自体は止めません。

## File Map

| File | Summary |
| --- | --- |
| `index.ts` | root wrapper。`handleRequest` / `startAgentCoreServer` を公開し、直接実行時は server を起動します。 |
| `adapters/http-server.ts` | AgentCore Runtime HTTP / WebSocket contract を `Bun.serve` で実装し、`/invocations` を `buildResponse`、`/ws` message を `streamResponse` に委譲します。 |
| `application/build-response.ts` | 設定確認、prompt 検証、履歴取得、supervisor 実行、Memory 保存、Runtime response 作成を担います。 |
| `application/build-stream-response.ts` | WebSocket streaming 用の設定確認、prompt 検証、履歴取得、`supervisor.stream()` 実行、Memory 保存、browser event 送信を担います。 |
| `application/stream-events.ts` | Strands stream event を browser 向け `delta` / `tool_start` / `tool_end` event に変換します。 |
| `application/agent-deps.ts` | agent 組み立て時の依存注入 contract と model 解決を定義します。 |
| `application/specialists/database-agent.ts` | database 専門 RAG agent と supervisor 用 tool 変換を定義します。 |
| `application/specialists/document-agent.ts` | document 専門 RAG agent と supervisor 用 tool 変換を定義します。 |
| `application/specialists/law-agent.ts` | law（児童虐待防止法）専門 RAG agent と supervisor 用 tool 変換を定義します。 |
| `application/specialists/medical-care-law-agent.ts` | medical_care_law（保険診療基本法令テキストブック）専門 RAG agent と supervisor 用 tool 変換を定義します。 |
| `application/specialists/support-activity-agent.ts` | support_activity（住民台帳・世帯・支援ケース・活動ログの synthetic structured data）専門 agent と supervisor 用 tool 変換を定義します。 |
| `application/supervisor-agent.ts` | 専門 tool を束ねた supervisor agent を組み立てます。 |
| `application/message-text.ts` | Strands `Message` から user-facing な `textBlock` だけを連結して取り出します。 |
| `application/soap-draft-agent.ts` | SOAP 下書き生成用の単発 agent（`structuredOutputSchema`）と記録種別ラベルを定義します。supervisor の tool ではありません。 |
| `application/build-soap-draft-response.ts` | `type: "soap_draft"` payload の text 検証、agent 実行、`StructuredOutputError` の error 応答変換を担います。 |
| `application/soap-gaps-detection-agent.ts` | 意味的な不足検出用の単発 agent（`structuredOutputSchema`）を定義します。ルールベースでは拾えない、S/O が A を意味的に支えているか・S/O の混在・字句一致しない矛盾・数値化されていない曖昧表現を検出します。 |
| `application/soap-gaps-agent.ts` | 不足確認の質問生成用の単発 agent（`structuredOutputSchema`）を定義します。不足の判定は行わず、渡された不足を自然文の質問に変換するだけです。 |
| `application/build-soap-gaps-response.ts` | `type: "soap_gaps"` payload の candidates 検証、ルールベース不足検出、AI による意味的な不足検出と統合（`mergeGapLists`）、優先度上位への AI 質問生成、両 AI ステップの fallback（不足一覧そのまま / テンプレート質問文）への変換を担います。 |
| `contracts/runtime.ts` | AgentCore Runtime の入力 / 出力 JSON（chat / soap_draft / soap_gaps）と `Responder` seam を定義します。 |
| `contracts/soap-draft.ts` | SOAP 分類・記録種別の zod schema（`soapDraftCandidateSchema` / `soapDraftOutputSchema`）と型を定義します。 |
| `contracts/soap-gaps.ts` | 不足種別・不足（`gapSchema`）・質問（`gapQuestionSchema`）・AI 意味的検出 agent 用 schema（`aiGapDetectionOutputSchema`）・AI 質問生成 agent 用 schema の zod schema と型を定義します。 |
| `contracts/websocket.ts` | Browser から受ける `user_message` / `ping` と、AgentCore から返す stream event contract を定義します。 |
| `domain/session.ts` | prompt / actor ID / session ID の取り出しと、履歴付き supervisor message の組み立てを定義します。 |
| `domain/soap-draft.ts` | payload が `soap_draft` リクエストかどうかの判定、分類対象テキストの取り出しを定義します。 |
| `domain/soap-gaps.ts` | SOAP 下書き候補からの不足検出ルール（根拠不足・次回予定の欠落・曖昧表現・矛盾・確認推奨）、AI 検出結果への決定的な skippable 付与（`toGap`）、ルールベースと AI 検出結果の統合・重複排除（`mergeGapLists`）、優先度付け、fallback 質問文生成を定義します。 |
| `infra/config.ts` | Bedrock model ID、SOAP 下書き生成 / 不足確認質問生成それぞれの専用 model ID（任意）、複数の KB ID、support_activity SQL KB ID / optional ARN、Memory ID、region、retrieval 件数を env から読み取ります。 |
| `infra/knowledge-base.ts` | AWS SDK v3 の `RetrieveCommand` と Strands `tool()` を使い、専用 KB 検索 tool を作ります。 |
| `infra/structured-data.ts` | support_activity structured-data RAG 用の provider seam と Strands `query_structured_data` tool を定義します。 |
| `infra/structured-data-bedrock.ts` | Bedrock SQL Knowledge Base の `Retrieve` と optional `GenerateQuery` debug output を provider に閉じます。 |
| `infra/memory.ts` | AgentCore Memory の `CreateEvent` / `ListEvents` を使い、直近履歴の取得と今回ターンの保存を行います。 |
| `infra/model.ts` | `Config` から Strands `BedrockModel` を生成します。 |
| `evaluation/law-kb-comparison.ts` | 同一 query を現行 `law` KB と `law_hierarchical` KB に `Retrieve` し、JSON で比較出力する dev / evaluation CLI です。 |

## Change Guide

- AgentCore HTTP endpoint、status code、decode / response 化を変える場合は `adapters/http-server.ts` と `contracts/runtime.ts` を先に見ます。
- WebSocket endpoint、upgrade context、browser event contract、message size / validation を変える場合は `adapters/http-server.ts` と `contracts/websocket.ts` を先に見ます。
- Runtime payload、prompt / actor / session の扱いを変える場合は `contracts/runtime.ts` と `domain/session.ts` を更新し、`application/build-response.ts` / `application/build-stream-response.ts` の利用箇所を合わせます。
- SOAP 下書き生成の分類 schema・system prompt・反映候補（記録種別）の推薦ロジックを変える場合は `contracts/soap-draft.ts`、`domain/soap-draft.ts`、`application/soap-draft-agent.ts`、`application/build-soap-draft-response.ts` を合わせ、`packages/bff/application/handle-soap-draft-request.ts` と `packages/workbench` の `src/features/soap-draft/` も確認します。
- 不足確認のルールベース検出ルール（種別・優先度・fallback 質問文・AI 検出結果との統合）を変える場合は `contracts/soap-gaps.ts` と `domain/soap-gaps.ts` を見ます。意味的な不足検出の system prompt を変える場合は `application/soap-gaps-detection-agent.ts` を、質問生成の system prompt を変える場合は `application/soap-gaps-agent.ts` を見ます。3者の組み合わせ方（ルールベース→AI 検出統合→優先度上位だけ質問生成 AI に渡す・各 AI 失敗時の fallback）を変える場合は `application/build-soap-gaps-response.ts` を見ます。あわせて `packages/bff/application/handle-soap-gaps-request.ts` と `packages/workbench` の `src/features/soap-gaps/` も確認します。
- Strands stream event から browser event への表示内容を変える場合は `application/stream-events.ts` と Chat UI 側の `packages/chat-ui/websocket-chat.ts` を合わせます。
- supervisor の system prompt や専門 tool の束ね方を変える場合は `application/supervisor-agent.ts` を見ます。
- 複数の専門 agent の構成、tool 名、system prompt、KB / structured-data provider 割り当てを変える場合は `application/specialists/` 配下の該当 domain file と `infra/config.ts` を合わせます。
- support_activity の Bedrock SQL KB を変える場合は `infra/structured-data*.ts`、`infra/config.ts`、`terraform/aws/agentcore/structured-data.tf` / `redshift-spectrum.tf` を合わせます。
- KB retrieval の client、検索件数、整形を変える場合は `infra/knowledge-base.ts` を見ます。
- `law` KB の chunking 比較を行う場合は `evaluation/law-kb-comparison.ts` と `LAW_HIERARCHICAL_KB_ID` を使います。通常回答経路を切り替える変更ではありません。
- Memory の履歴件数、整形、保存 payload、ページングを変える場合は `infra/memory.ts` を見ます。
- model ID / region / env の追加や必須設定の変更は `infra/config.ts` と Terraform の runtime env を合わせます。
