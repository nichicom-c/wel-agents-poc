# packages/workbench

`packages/workbench` は WEL Agents Workbench の React web app です。Chat 画面に作業を集約せず、SOAP Studio・Voice Capture・Knowledge Review・Training のように作業目的ごとに画面を分ける想定の workspace shell を提供します。現時点ではホームページ（Workspace Nav + 各画面の枠 + Context Inspector）のみを実装しており、各画面の機能は今後追加します。

このディレクトリは Bun workspace `@wel-agents-poc/workbench` です。依存（`react` / `react-dom` と build 用 `vite` / `@vitejs/plugin-react` / `@types/react` / `@types/react-dom`）と `build` スクリプトは `package.json` が所有します（横断ツールと単一 `bun.lock` はルート）。

## Entry Points

| File | Role |
| --- | --- |
| `index.html` | Vite が配信する HTML shell。`#root` と `/src/main.tsx` を読み込みます。 |
| `src/main.tsx` | React app の mount 専用 entrypoint。`App` と `src/app/styles.css` を読み込みます。 |
| `src/app/App.tsx` | ヘッダー、Workspace Nav、選択中画面のメインパネル、Context Inspector を組み立てます。SOAP Studio のみ実データの枠を描画し、他の nav 項目は準備中表示です。 |
| `src/app/workspace-nav.ts` | Workspace Nav 項目、SOAP Studio の4カード、Context Inspector 項目の静的データを定義します。 |
| `src/app/styles.css` | ヘッダー / 3ペイン layout（Workspace Nav・メインパネル・Context Inspector）、SOAP Studio カードの配色を担います。 |
| `vite.config.ts` | `mise run dev:workbench` / `mise run start:workbench` / `bun run build:workbench` の設定。env 読み込み（`envDir` + `loadEnv`）、host/port、build 出力先を定義します。 |

`bun run build:workbench` は `packages/workbench/` を root にして `dist/workbench/` を生成します。

## Configuration

env は `packages/workbench/.env.example` が所有します。`.env` にコピーして使い（`.env` は gitignore 済み）、`mise run dev:workbench` / `mise run start:workbench` は packages/workbench に cd して Vite を起動します。`vite.config.ts` は `envDir` を packages/workbench（root）に設定し、`WORKBENCH_HOST` / `WORKBENCH_PORT` を `loadEnv(mode, root, "")` で読み取ります（既定 `http://127.0.0.1:4175`）。

## Change Guide

- Workspace Nav の項目や既定選択画面を変える場合は `src/app/workspace-nav.ts` の `WORKSPACE_NAV_ITEMS` / `DEFAULT_WORKSPACE_NAV_ID` を見ます。
- SOAP Studio の4カードの文言や配色を変える場合は `src/app/workspace-nav.ts` の `SOAP_STUDIO_CARDS` と `src/app/styles.css` の `.soap-studio-card[data-accent=...]` を見ます。
- 各 Workspace Nav 項目（Chat / Voice Capture / Knowledge Review / Training）に実機能を追加する場合は、`src/app/App.tsx` の `ComingSoonView` 分岐を、その画面専用のコンポーネントに置き換えます。
