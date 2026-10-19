# このリポジトリでの shadcn

**このファイルだけが `wel-agents-poc` 固有。** 他のファイルは shadcn 公式配布のまま置いてあり、上流更新をそのまま当てられるようにしている。両者が食い違う場合はこのファイルが優先。

## 適用範囲

shadcn が入っているのは **`packages/workbench/` だけ**。`packages/chat-ui/` は手書き CSS のままで、Tailwind も shadcn も入っていない。chat-ui の見た目を変える依頼が来たら、まず「shadcn を導入するのか、既存 CSS を触るのか」を確認する。

## プロジェクト設定(`npx shadcn@latest info` の代わり)

`components.json` は `packages/workbench/` 直下にあるので、**CLI は必ず `cd packages/workbench` してから叩く**。

| 項目 | 値 | 効いてくる点 |
| --- | --- | --- |
| パッケージランナー | `bunx --bun shadcn@latest` | 上流ドキュメントの `npx` / `pnpm dlx` はこれに読み替える。素の `bun` は mise 管理なので `eval "$(mise activate bash)"` 済みのシェルか `mise exec -- ` 経由で |
| `style` | `base-nova` | |
| `base` | **`base`(Base UI)** | Radix ではない。トリガーの差し替えは `asChild` ではなく **`render`** → [base-vs-radix.md](./base-vs-radix.md) |
| `iconLibrary` | `lucide`(`lucide-react`) | |
| framework | Vite SPA(`rsc: false`) | **`"use client"` は不要**。付けない |
| Tailwind | v4、`src/app/styles.css` | `tailwind.config.js` は無い。テーマは同ファイルの `@theme inline` / `:root` |
| エイリアス | `@/` → `packages/workbench/src` | ルート `tsconfig.json` の `paths` と `packages/workbench/vite.config.ts` の `resolve.alias` の**両方**に定義済み。片方だけ直すと型か実行時のどちらかが壊れる |

## 導入済みコンポーネント

`src/components/ui/`: `alert` `badge` `button` `card` `checkbox` `empty` `field` `input` `label` `message` `radio-group` `select` `separator` `spinner` `tabs` `textarea`。

**上流の [chat.md](./chat.md) が前提にしている `Bubble` と `MessageScroller` は入っていない。** レジストリには存在するので必要になったら `add` すればよいが、現状チャット2画面(Training の教材チャット / SOAP Studio の不足確認)は `Message` + `MessageContent` に自前の吹き出し `div` を重ねて作ってある。`MessageScroller` は高さが固定された領域を前提とする一方、この2つは縦に伸びるパネルの中にあるため見送った経緯がある。チャット UI を触るならまずこの差を認識してから chat.md を読むこと。

## `add` の後に必ずやること

CLI が吐くコードはこのリポジトリの規約に合っていない。`bunx --bun shadcn@latest add <name>` のたびに次を確認する。

1. **`from "cn"` を `from "@/lib/utils"` に直す。** CLI は `import { cn } from "cn"` と書き、ご丁寧に `cn` という無関係な npm パッケージまで `package.json` に足してくる。パッケージは `bun remove cn` で消す。
   ```sh
   grep -rl 'from "cn"' src | xargs -r sed -i 's#from "cn"#from "@/lib/utils"#'
   ```
2. **依存を exact 固定に戻す。** CLI は `^x.y.z` で書く。リポジトリ規約は exact(`x.y.z`)。
   ```sh
   sed -i -E 's/"\^([0-9])/"\1/' package.json
   ```
3. **上書きプロンプトに注意。** 既存コンポーネント(特に `button.tsx`)があると、`-y` を付けていても `Would you like to overwrite?` で**対話待ちのまま止まる**。`printf 'N\n' | bunx --bun shadcn@latest add <name> -y` のように答えを流し込む。
4. 追加されたファイルを読む。上流レジストリ由来のものは import パスやアイコンライブラリがこのリポジトリと合わないことがある。
5. **`data-xxx:` スタイルフックに対応する `@custom-variant` があるか確認する。** 下記参照。

## スタイルフック(`@custom-variant`)

上流の生成コンポーネントは `data-horizontal:` / `data-vertical:` のような**真偽値属性を前提にした variant** を書く。ところが Base UI が実際に出すのは `data-orientation="horizontal"` という**列挙属性**で、両者は噛み合わない。上流プロジェクトはこの対応を `shadcn/tailwind.css` で宣言しているが、このリポジトリはそれを読み込んでいないので `src/app/styles.css` で自前で宣言している。

```css
@custom-variant data-horizontal (&[data-orientation="horizontal"]);
@custom-variant data-vertical (&[data-orientation="vertical"]);
```

**宣言が無いとクラスが1つも生成されず、しかもエラーにならない。** 実際に Tabs がこれで壊れた: 根要素の `data-horizontal:flex-col` が効かず `flex`(横並び)のままになり、**タブが左・内容が右**に並んだ上、選択中タブの下線(`group-data-horizontal/tabs:after:*` で位置と太さを与えている)も出なかった。型検査もビルドも通るので、気づけるのは画面を見たときだけ。

`data-checked` / `data-active` / `data-disabled` のような**真偽値**のフックは Base UI がそのまま出すので宣言は要らない。新しく `add` したコンポーネントが列挙属性ベースのフック(`data-side` / `data-align` など)を使っていたら、同じ要領で宣言を足す。`src/app/styles.test.ts` が `components/ui/` の使用箇所と宣言の突き合わせを検証している。

## 書くときの約束

- **生成物(`src/components/ui/`)は Biome の対象外**(`biome.json` の `files.includes` で除外)。上流の整形のまま置く。自分で書くファイルはこの外に置き、Biome を通す。
- **新しい CSS ファイルを作らない。** 配色・余白・文字スタイルはユーティリティで書く。素のセレクタが要る例外は `src/app/message-markdown.css` だけで、これはカスケードレイヤーに閉じ込めてある。理由は [dads skill](../../dads/rules/tokens.md) 参照。
- **配色は shadcn のセマンティックトークン**(`bg-primary` / `text-muted-foreground`)で指定する。値は DADS のパレットに割り当て済み。**文字サイズは DADS のユーティリティ**(`text-std-16N-170` など)を使うが、命名は自由に組めない — 実在する組み合わせは [dads skill の tokens.md](../../dads/rules/tokens.md) にある。
- **ダークテーマは無い**(DADS が light のみ)。`dark:` バリアントを新たに書かない。
- **`Card` は素の `div`** で、`render` prop を持たない。`<section>` や `<header>` にしたいときは `Card` を囲む。
- マスタ一覧の Select は共有ラッパー **`@/components/option-select`** を使う。`{ value, label }[]` を渡すだけでよい(Base UI の Select は選択中ラベルを引くのに root の `items` が要るため、素で書くと値がそのまま出る)。

## 確認

```sh
bun run check          # Biome
bun run typecheck      # tsc --noEmit
bun test packages/workbench
bun run build:workbench
```

ビューのテストは `renderToStaticMarkup` による SSR なので、**ポップオーバー(Select / Dialog 等)の中身は描画されない**。アサーションはトリガーやラベルの文言に当てる。クラス名に当てると、このリポジトリで進めているような作り替えで**黙って素通りするテスト**になる。
