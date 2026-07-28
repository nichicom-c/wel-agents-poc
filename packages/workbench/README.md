# packages/workbench

`packages/workbench` は WEL Agents Workbench の React web app です。Chat 画面に作業を集約せず、SOAP Studio・Voice Capture・Knowledge Review・Training のように作業目的ごとに画面を分ける想定の workspace shell を提供します。SOAP Studio は「SOAP 下書き生成」（issue #5）を実装済みで、入力テキストから S/O/A/P/未分類の候補（根拠原文・分類理由・信頼度つき）を生成し、解析結果全体に対する反映候補（支援実績/汎用記録/会議/サマリーのチェックボックス、LLM 推薦を初期値にユーザーが上書き可能。個々の候補ごとではない）と、候補ごとの採用/編集/却下/後で確認を session-local に選べます（正式記録への自動保存はしません）。記録種別は分類前の入力ではなく分類後の推薦であることに注意してください。他の nav 項目は準備中表示です。

このディレクトリは Bun workspace `@wel-agents-poc/workbench` です。依存（`react` / `react-dom` と build 用 `vite` / `@vitejs/plugin-react` / `@types/react` / `@types/react-dom`）と `build` スクリプトは `package.json` が所有します（横断ツールと単一 `bun.lock` はルート）。

## Entry Points

| File | Role |
| --- | --- |
| `index.html` | Vite が配信する HTML shell。`#root` と `/src/main.tsx` を読み込みます。 |
| `src/main.tsx` | React app の mount 専用 entrypoint。`App` と `src/app/styles.css` を読み込みます。 |
| `src/app/App.tsx` | ヘッダー、Workspace Nav、選択中画面のメインパネル、Context Inspector を組み立てます。SOAP Studio は `src/widgets/soap-studio/SoapStudioView.tsx` を描画し、他の nav 項目は準備中表示です。 |
| `src/app/workspace-nav.ts` | Workspace Nav 項目、Context Inspector 項目を定義します。 |
| `src/app/styles.css` | ヘッダー / 3ペイン layout、SOAP 下書き生成フォーム / 候補カード / 信頼度バッジのスタイルを担います。 |
| `src/features/soap-draft/api/soap-draft.ts` | BFF `POST /api/soap-draft` を呼び、response を候補配列と入力全体の反映候補（`recommendedRecordTypes`）に正規化します。 |
| `src/features/soap-draft/model/` | 反映候補チェックボックス用の記録種別定数・ラベル、候補の client 側 status（採用/編集/却下/後で確認）・反映候補チェック状態・カテゴリ分類・信頼度3段階変換を扱う純粋関数群です。 |
| `src/widgets/soap-studio/SoapStudioView.tsx` | 入力欄・解析ボタン、解析結果全体に対する反映候補チェックボックス（☑/☐、LLM 推薦が初期値）、候補一覧（カテゴリごと）と候補ごとの採用/編集/却下/後で確認 UI を持つ SOAP Studio 本体です。 |
| `vite.config.ts` | `mise run dev:workbench` / `mise run start:workbench` / `bun run build:workbench` の設定。env 読み込み（`envDir` + `loadEnv`）、host/port、`/api/soap-draft` の BFF proxy、build 出力先を定義します。 |

`bun run build:workbench` は `packages/workbench/` を root にして `dist/workbench/` を生成します。

## Configuration

env は `packages/workbench/.env.example` が所有します。`.env` にコピーして使い（`.env` は gitignore 済み）、`mise run dev:workbench` / `mise run start:workbench` は packages/workbench に cd して Vite を起動します。`vite.config.ts` は `envDir` を packages/workbench（root）に設定し、`WORKBENCH_HOST` / `WORKBENCH_PORT` / `BFF_URL` を `loadEnv(mode, root, "")` で読み取ります（既定 `http://127.0.0.1:4175`、BFF 未設定時は local BFF `http://localhost:4174`）。`/api/soap-draft` は Vite dev/preview server の proxy を経由して BFF（`mise run dev:bff`）へ転送されます。

## Change Guide

- Workspace Nav の項目や既定選択画面を変える場合は `src/app/workspace-nav.ts` の `WORKSPACE_NAV_ITEMS` / `DEFAULT_WORKSPACE_NAV_ID` を見ます。
- SOAP 下書き生成の分類ロジック・反映候補（記録種別）の推薦・候補 status を変える場合は `src/features/soap-draft/model/` と `src/widgets/soap-studio/SoapStudioView.tsx`、backend 側は `packages/agentcore/application/soap-draft-agent.ts` / `build-soap-draft-response.ts` を合わせます。
- `/api/soap-draft` の request/response contract を変える場合は `src/features/soap-draft/api/soap-draft.ts` と `packages/bff/application/handle-soap-draft-request.ts` を合わせます。
- 各 Workspace Nav 項目（Chat / Voice Capture / Knowledge Review / Training）に実機能を追加する場合は、`src/app/App.tsx` の `ComingSoonView` 分岐を、その画面専用のコンポーネントに置き換えます。
