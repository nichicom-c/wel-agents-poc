---
name: dads
description: デジタル庁デザインシステム(DADS, https://design.digital.go.jp/dads/)のデザイントークンとグリッドシステムを `packages/workbench/` で使うためのガイド。Workbench は Tailwind CSS v4 + shadcn + DADS 全面適用済みなので、配色をどのトークンで指定するか、文字スタイルにどのユーティリティ名が実在するか、DADS 準拠のレイアウト(12カラムグリッド、768px ブレークポイント、文字サイズ基準のガター/マージン)をどう組むかを調べる際に使う。個別 UI コンポーネントの仕様(Figma デザインデータ由来のもの)は対象外 — それは shadcn skill の領域。Trigger: "DADS", "デジタル庁 デザインシステム", "政府 デザインシステム", "行政 デザインシステム", "グリッドシステム", "12カラム", "design.digital.go.jp".
---

# デジタル庁デザインシステム(DADS)統合

[デジタル庁デザインシステムβ版(DADS)](https://design.digital.go.jp/dads/) は、行政サービスの UI 実装を統一するために公開されているデザインシステム。本スキルは DADS のうち **デザイントークン** と **グリッドシステム(レイアウト)** を `packages/workbench/` でどう使うかを扱う。

## DADS の全体構成と本スキルの範囲

DADS は次の4要素で構成される。

1. 公式ウェブサイト(ガイドライン、コンポーネント仕様、アクセシビリティドキュメント)
2. Figma デザインデータ(v2系/v1系)
3. コードスニペット(デザイントークン・サンプルコード、GitHub 公開)
4. グラフィック素材(イラスト・アイコン)

**本スキルが扱うのは 1(レイアウト原則)と 3(デザイントークンの npm パッケージ)のみ。** 2 の Figma デザインデータ、および個別コンポーネント(ボタン・フォーム・モーダル等)の仕様には踏み込まない。UI コンポーネントの実装は `shadcn` skill(`.agents/skills/shadcn/`)に委ね、DADS はその配色・タイポグラフィ・グリッドという「基盤」レイヤーにのみ関与する。

## 参照先

- [rules/tokens.md](./rules/tokens.md) — デザイントークン(`@digital-go-jp/tailwind-theme-plugin`)と、shadcn のセマンティックトークンとの対応づけ。
- [rules/grid.md](./rules/grid.md) — グリッドシステム(12カラム、768px ブレークポイント、文字サイズ基準のガター)の原則と Tailwind CSS v4 実装パターン。

## このリポジトリでの適用状況

対象は `packages/workbench/` のみ(`packages/chat-ui/` は手書き CSS のままで、DADS も shadcn も入っていない)。Workbench は shadcn CLI(`base-nova` プリセット、`base: "base"` = Base UI プリミティブ)を使い、**DADS を全面適用済み**。つまり新規に導入する作業はなく、本スキルは「既に入っているものをどう使うか」の参照として読む。

- トークンは `packages/workbench/src/app/styles.css` で読み込み済み。同ファイルの `:root` が shadcn のセマンティックトークン(`--primary` など)を DADS のパレット(`--color-key-*` / `--color-solid-gray-*` / `--color-error-*` / `--color-focus-yellow`)へ割り当てている。
- **DADS にダークテーマは無いので Workbench は light 固定。** `prefers-color-scheme` による分岐や `dark:` バリアントを新規に足さない。
- 配色は `bg-primary` / `text-muted-foreground` のような **shadcn のセマンティックトークン経由で指定する**。`bg-key-600` のような DADS 生トークンを直接使うのは、セマンティックトークンに対応が無い場合(SOAP 区分の色分けなど)に限る。その例が `packages/workbench/src/features/soap-draft/ui/category-accents.ts`。
- 文字スタイルは DADS のタイポグラフィユーティリティ(`text-std-16N-170` など)を使う。[tokens.md](./rules/tokens.md) に実在するユーティリティ名の一覧がある(`text-std-14N-170` のような存在しない組み合わせを書かないこと)。

## 重要な事実確認(調査結果)

- DADS 公式サイトのレイアウトページはグリッド原則(12カラム、768px ブレークポイント、ガター=文字サイズ×2 など)を文章で示すのみで、**確定 px 値や実装コードは公開していない**。
- `digital-go-jp/design-tokens` / `digital-go-jp/tailwind-theme-plugin` / `digital-go-jp/design-system-example-components-{html,react}` のいずれにも、グリッド/レイアウト専用のトークンやコンポーネントは含まれていない(色・タイポグラフィ・角丸・シャドウ・aspect-ratio のみ)。
- そのため [grid.md](./rules/grid.md) の実装パターンは公式の確定仕様ではなく、公開されている原則(相対値ベース)を Tailwind CSS v4 の慣用パターンに翻訳した提案である。プロジェクトの要件に応じてガター幅・マージン幅は調整してよい。
