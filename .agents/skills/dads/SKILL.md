---
name: dads
description: デジタル庁デザインシステム(DADS, https://design.digital.go.jp/dads/)のデザイントークン・グリッドシステムを、このプロジェクトの Tailwind CSS v4 + shadcn 構成に統合するためのガイド。DADS 準拠のレイアウト(12カラムグリッド、768px ブレークポイント、文字サイズ基準のガター/マージン)を実装する、または `@digital-go-jp/design-tokens` / `@digital-go-jp/tailwind-theme-plugin` を導入する際に使う。個別 UI コンポーネントの仕様(Figma デザインデータ由来のもの)は対象外 — それは shadcn / frontend-design skill の領域。Trigger: "DADS", "デジタル庁 デザインシステム", "政府 デザインシステム", "行政 デザインシステム", "グリッドシステム", "12カラム", "design.digital.go.jp".
---

# デジタル庁デザインシステム(DADS)統合

[デジタル庁デザインシステムβ版(DADS)](https://design.digital.go.jp/dads/) は、行政サービスの UI 実装を統一するために公開されているデザインシステム。本スキルは DADS のうち **デザイントークン** と **グリッドシステム(レイアウト)** をこのプロジェクトに統合する方法を扱う。

## DADS の全体構成と本スキルの範囲

DADS は次の4要素で構成される。

1. 公式ウェブサイト(ガイドライン、コンポーネント仕様、アクセシビリティドキュメント)
2. Figma デザインデータ(v2系/v1系)
3. コードスニペット(デザイントークン・サンプルコード、GitHub 公開)
4. グラフィック素材(イラスト・アイコン)

**本スキルが扱うのは 1(レイアウト原則)と 3(デザイントークンの npm パッケージ)のみ。** 2 の Figma デザインデータ、および個別コンポーネント(ボタン・フォーム・モーダル等)の仕様には踏み込まない。このプロジェクトの UI コンポーネント実装は既存の `shadcn` skill(`.claude/skills/shadcn/`)と `frontend-design` skill に委ねる方針(`.claude/rules/ui-components.md`)を維持し、DADS はその配色・タイポグラフィ・グリッドという「基盤」レイヤーにのみ関与する。

## 参照先

- [rules/tokens.md](./rules/tokens.md) — デザイントークン(`@digital-go-jp/tailwind-theme-plugin`)の導入方法と、既存の shadcn テーマ(`src/index.css`)との共存・衝突ポイント。
- [rules/grid.md](./rules/grid.md) — グリッドシステム(12カラム、768px ブレークポイント、文字サイズ基準のガター)の原則と Tailwind CSS v4 実装パターン。

## このプロジェクトへの適用方針

本プロジェクト(`base-ui-react-sample`)は shadcn CLI(`base-nova` プリセット、`base: "base"` = Base UI プリミティブ)を使ったサンプルであり、`src/index.css` は shadcn がニュートラルカラーの CSS 変数(oklch)を管理している。DADS を全面的に適用する(配色を DADS の青基調パレットに置き換える)か、グリッド原則だけを部分採用するかはプロジェクトの目的次第。判断に迷う場合は次を基準にする。

- **行政サービス・DADS 準拠が必須の画面を作る** → [tokens.md](./rules/tokens.md) の手順で `@digital-go-jp/tailwind-theme-plugin` を導入し、配色・タイポグラフィごと DADS に揃える。
- **既存の shadcn テーマは維持しつつ、レイアウトの考え方だけ DADS に寄せたい**(今回の主目的)→ トークンの導入は不要。[grid.md](./rules/grid.md) のグリッド実装パターンだけを適用すれば足りる。Tailwind CSS v4 の既定ブレークポイント `md:`(768px)が DADS の唯一のブレークポイントと一致するため、追加設定なしで原則に沿ったレイアウトが組める。

## 重要な事実確認(調査結果)

- DADS 公式サイトのレイアウトページはグリッド原則(12カラム、768px ブレークポイント、ガター=文字サイズ×2 など)を文章で示すのみで、**確定 px 値や実装コードは公開していない**。
- `digital-go-jp/design-tokens` / `digital-go-jp/tailwind-theme-plugin` / `digital-go-jp/design-system-example-components-{html,react}` のいずれにも、グリッド/レイアウト専用のトークンやコンポーネントは含まれていない(色・タイポグラフィ・角丸・シャドウ・aspect-ratio のみ)。
- そのため [grid.md](./rules/grid.md) の実装パターンは公式の確定仕様ではなく、公開されている原則(相対値ベース)を Tailwind CSS v4 の慣用パターンに翻訳した提案である。プロジェクトの要件に応じてガター幅・マージン幅は調整してよい。
