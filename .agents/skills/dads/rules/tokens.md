# デザイントークン

デジタル庁デザインシステム(DADS)のデザイントークンは、GitHub `digital-go-jp/design-tokens` を正とし、Figma Tokens Studio → GitHub Actions → Style Dictionary のパイプラインで npm パッケージとしてビルド・公開されている。Tailwind CSS 向けには、そのトークンをラップした `@digital-go-jp/tailwind-theme-plugin` を使う。

- トークン定義そのもの: [digital-go-jp/design-tokens](https://github.com/digital-go-jp/design-tokens)(npm: `@digital-go-jp/design-tokens`)。`tokens.css`(全トークン)と `tokens-simple.css`(色・フォント・elevation のみ)を提供。
- Tailwind 統合プラグイン: [digital-go-jp/tailwind-theme-plugin](https://github.com/digital-go-jp/tailwind-theme-plugin)(npm: `@digital-go-jp/tailwind-theme-plugin`)。**Workbench は Tailwind CSS v4 なのでこちらを使う。**

## 読み込み状況(導入済み)

`packages/workbench/package.json` に exact 固定で入っており、`packages/workbench/src/app/styles.css` の冒頭で読み込み済み。**新規にインストールする作業は無い。**

```css
@layer theme, base, components, markdown, utilities;

@import "tailwindcss";
@import "tw-animate-css";
@import "@fontsource-variable/noto-sans-jp";
@import "@digital-go-jp/tailwind-theme-plugin/v4";
@import "./message-markdown.css" layer(markdown);
```

`@layer` 宣言が先頭にあるのは、`message-markdown.css`(react-markdown の出力を素のセレクタで整える唯一のファイル)をレイヤー無しで import すると、**レイヤー無しの CSS が全レイヤーより優先されて** Tailwind のユーティリティを上書きしてしまうため。素のセレクタを書く CSS を足す場合は同じ扱いにする。

Workbench に CSS ファイルを新規に足すことは基本的に無い。配色・余白・文字スタイルはすべてユーティリティで指定する。

## 提供されるトークン

`@theme` ブロックと `@utility` として、以下が定義される(色・タイポグラフィ・角丸・シャドウのみ。**グリッド/レイアウト用トークンは含まれない** → [grid.md](./grid.md) 参照)。

| カテゴリ | 内容 |
| --- | --- |
| 色 | `--color-key-*` / `--color-blue-*` / `--color-light-blue-*` / `--color-cyan-*` / `--color-green-*` / `--color-lime-*` / `--color-yellow-*` / `--color-orange-*` / `--color-red-*` / `--color-magenta-*` / `--color-purple-*`(各 50〜1200 の12段階)、`--color-solid-gray-*` / `--color-opacity-gray-*`、`--color-success-*` / `--color-error-*` / `--color-warning-*`、`--color-focus-yellow` / `--color-focus-blue` |
| フォント | `--font-sans: 'Noto Sans JP', ...`、`--font-mono: 'Noto Sans Mono', ...`、`--font-weight-400` / `--font-weight-700` |
| 行高 | `--leading-100`〜`--leading-175`(および `--leading-1-0`〜`--leading-1-75` エイリアス) |
| 角丸 | `--radius-4` / `--radius-6` / `--radius-8` / `--radius-12` / `--radius-16` / `--radius-24` / `--radius-32` / `--radius-full` |
| シャドウ(elevation) | `--shadow-1`〜`--shadow-8` |
| タイポグラフィ | `@utility text-{カテゴリ}-{サイズ}{太さ}-{行高}` 形式のユーティリティ群(下表) |

本文の標準文字サイズは `text-std-16N-170`(`font-size: 1rem`)。[grid.md](./grid.md) のガター計算はこの 1rem を基準にしている。

### 実在するタイポグラフィユーティリティ

**組み合わせは自由ではない。** 下表に無い名前(例: `text-std-14N-170`)を書いてもクラスが生成されず、文字サイズが無指定のまま素通りする。小さい文字が要るときは `std` ではなく `dns` / `oln` から選ぶ。

| カテゴリ | 用途 | サイズ-行高の組み合わせ |
| --- | --- | --- |
| `dsp` | ディスプレイ(大見出し) | `48B-140` `48N-140` `57B-140` `57N-140` `64B-140` `64N-140` |
| `std` | 標準(本文・見出し) | `16B-170` `16B-175` `16N-170` `16N-175` `17B-170` `17N-170` `18B-160` `18N-160` `20B-150` `20B-160` `20N-150` `22B-150` `22N-150` `24B-150` `24N-150` `26B-150` `26N-150` `28B-150` `28N-150` `32B-150` `32N-150` `36B-140` `36N-140` `45B-140` `45N-140` |
| `dns` | 高密度(補足・ラベル) | `14B-120` `14B-130` `14N-120` `14N-130` `16B-120` `16B-130` `16N-120` `16N-130` `17B-120` `17B-130` `17N-120` `17N-130` |
| `oln` | 1行表示(ボタン等) | `14B-100` `14N-100` `16B-100` `16N-100` `17B-100` `17N-100` |
| `mono` | 等幅 | `14B-150` `14N-150` `16B-150` `16N-150` `17B-150` `17N-150` |

`N` = 400、`B` = 700。末尾の数字は line-height ×100。Workbench での実際の使い分けは、本文 `text-std-16N-170`、画面見出し `text-std-24B-150`、節見出し `text-std-16B-170`、補足・メタ情報 `text-dns-14N-130`。

## shadcn セマンティックトークンとの対応づけ

shadcn は `--primary` / `--muted-foreground` のようなセマンティックトークンでコンポーネントを塗る。Workbench ではその値を DADS のパレットへ割り当てることで、**2つのパレットを混在させずに片方(DADS)へ統一している。** 割り当ては `packages/workbench/src/app/styles.css` の `:root` にまとまっている。

| shadcn | DADS |
| --- | --- |
| `--background` / `--muted` | `--color-solid-gray-50` |
| `--foreground` / `--secondary-foreground` | `--color-solid-gray-900` |
| `--primary` | `--color-key-600` |
| `--secondary` | `--color-solid-gray-100` |
| `--muted-foreground` | `--color-solid-gray-600` |
| `--accent` / `--accent-foreground` | `--color-key-50` / `--color-key-900` |
| `--destructive` | `--color-error-1` |
| `--border` / `--input` | `--color-solid-gray-420` / `--color-solid-gray-536` |
| `--ring` | `--color-focus-yellow` |
| `--radius` | `--radius-8` |

この対応があるので、**配色は原則 `bg-primary` / `text-muted-foreground` のような shadcn 側の名前で書く。** `bg-key-600` のような DADS 生トークンを直に使うのは、セマンティックトークンに対応が無い意味づけ(SOAP の S/O/A/P 区分など)に限る。

注意点:

- **`--font-sans` は DADS の `'Noto Sans JP', ...` がそのまま有効。** `@fontsource-variable/noto-sans-jp` も読み込んでいる。上書きしない。
- **ダークテーマは無い。** DADS は light のみを定義しているため、Workbench は `color-scheme: light` 固定。`.dark` クラスや `dark:` バリアントを新たに書かない(`@custom-variant dark` の宣言は shadcn 生成コンポーネントが参照するため残してあるだけ)。
- **`--color-error-1`** は DADS のエラー色。`--color-error-2` はより濃い段階。`--color-success-*` / `--color-warning-*` も同じ命名。
