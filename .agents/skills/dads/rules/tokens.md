# デザイントークンの導入

デジタル庁デザインシステム(DADS)のデザイントークンは、GitHub `digital-go-jp/design-tokens` を正とし、Figma Tokens Studio → GitHub Actions → Style Dictionary のパイプラインで npm パッケージとしてビルド・公開されている。Tailwind CSS 向けには、そのトークンをラップした `@digital-go-jp/tailwind-theme-plugin` を使う。

- トークン定義そのもの: [digital-go-jp/design-tokens](https://github.com/digital-go-jp/design-tokens)(npm: `@digital-go-jp/design-tokens`)。`tokens.css`(全トークン)と `tokens-simple.css`(色・フォント・elevation のみ)を提供。
- Tailwind 統合プラグイン: [digital-go-jp/tailwind-theme-plugin](https://github.com/digital-go-jp/tailwind-theme-plugin)(npm: `@digital-go-jp/tailwind-theme-plugin`)。**本プロジェクトは Tailwind CSS v4 なのでこちらを使う。**

## インストールと導入(Tailwind CSS v4)

```sh
bun add @digital-go-jp/tailwind-theme-plugin
```

`src/index.css` の import 群の末尾に追加する(shadcn の import より後に置き、優先順位を明示する)。

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
@import "@digital-go-jp/tailwind-theme-plugin/v4";
```

v3 プロジェクトの場合は `tailwind.config.js` の `plugins` に `require('@digital-go-jp/tailwind-theme-plugin')` を追加する(本プロジェクトでは使わない)。

## 提供されるトークン

`@theme` ブロックと `@utility` として、以下が定義される(色・タイポグラフィ・角丸・シャドウのみ。**グリッド/レイアウト用トークンは含まれない** → [grid.md](./grid.md) 参照)。

| カテゴリ | 内容 |
| --- | --- |
| 色 | `--color-key-*` / `--color-blue-*` / `--color-light-blue-*` / `--color-cyan-*` / `--color-green-*` / `--color-lime-*` / `--color-yellow-*` / `--color-orange-*` / `--color-red-*` / `--color-magenta-*` / `--color-purple-*`(各 50〜1200 の12段階)、`--color-solid-gray-*` / `--color-opacity-gray-*`、`--color-success-*` / `--color-error-*` / `--color-warning-*`、`--color-focus-yellow` / `--color-focus-blue` |
| フォント | `--font-sans: 'Noto Sans JP', ...`、`--font-mono: 'Noto Sans Mono', ...`、`--font-weight-400` / `--font-weight-700` |
| 行高 | `--leading-100`〜`--leading-175`(および `--leading-1-0`〜`--leading-1-75` エイリアス) |
| 角丸 | `--radius-4` / `--radius-6` / `--radius-8` / `--radius-12` / `--radius-16` / `--radius-24` / `--radius-32` / `--radius-full` |
| シャドウ(elevation) | `--shadow-1`〜`--shadow-8` |
| タイポグラフィ | `@utility text-{カテゴリ}-{サイズ}{太さ}-{行高}` 形式のユーティリティ群。カテゴリは `dsp`(display)/`std`(standard)/`dns`(dense)/`oln`(one-line)/`mono`。例: `text-std-16N-170` = 本文標準サイズ(16px / 400 / line-height 1.7)、`text-std-32B-150` = 見出し(32px / 700 / line-height 1.5) |

本文の標準文字サイズは `text-std-16N-170`(`font-size: 1rem`)。[grid.md](./grid.md) のガター計算はこの 1rem を基準にしている。

## 本プロジェクトとの共存に関する注意

このプロジェクトは shadcn CLI が `src/index.css` の `@theme inline` ブロックと `:root` / `.dark` の CSS 変数(`--color-primary` などの oklch ベースのニュートラルテーマ)を管理している。DADS プラグインとは変数の名前空間が異なる(`--color-primary` 系 vs `--color-key-*` 系)ため直接の上書きは起きないが、次の点は事前にレビューすること。

- **`--font-sans` が競合する。** shadcn 側は `"Geist Variable", sans-serif`、DADS 側は `'Noto Sans JP', ...` を定義する。後から import した方が勝つ(Tailwind v4 の `@theme` は同名変数を上書きする)。日本語行政サービス想定で DADS のフォントを使いたい場合は import 順を意識し、Geist を使い続けたい場合は DADS の `@import` の直後に `--font-sans` を再上書きする。
  ```css
  @import "@digital-go-jp/tailwind-theme-plugin/v4";
  @theme inline {
    --font-sans: "Geist Variable", sans-serif;
  }
  ```
- **配色思想が別物になる。** shadcn 側はニュートラルグレー基調、DADS 側は青(`key`/`blue`)を基調としたパレット。DADS の色を使った時点で `bg-primary` 等の shadcn セマンティックトークンとは別に `bg-key-600` のような DADS 生トークンで塗ることになるため、混在させる画面ではどちらのパレットで統一するか先に決める。
- **全面採用 vs 選択導入。** 「タイポグラフィスケールと角丸・シャドウだけ DADS に揃え、色は shadcn のセマンティックトークンを維持する」といった部分採用も可能。その場合は `tokens-simple.css` 相当(色・フォント・elevation)だけを個別 import するのではなく、プラグイン全体を import した上でコンポーネント側で使うユーティリティを絞る運用で問題ない(未使用の CSS 変数はビルドサイズにほぼ影響しない)。
