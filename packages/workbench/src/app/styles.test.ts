import { describe, expect, test } from "bun:test";

const stylesCss = await Bun.file(
  new URL("./styles.css", import.meta.url),
).text();

const dadsCss = await Bun.file(
  new URL(
    "../../node_modules/@digital-go-jp/tailwind-theme-plugin/dist/v4.css",
    import.meta.url,
  ),
).text();

/** `:root { ... }` の中で宣言されたカスタムプロパティを拾う。 */
function declarationsInRoot(css: string): Map<string, string> {
  const body = css.slice(css.indexOf(":root {") + ":root {".length);
  const out = new Map<string, string>();
  for (const line of body.slice(0, body.indexOf("\n}")).split("\n")) {
    const matched = line.match(/^\s*(--[\w-]+):\s*(.+?);\s*$/);
    if (matched?.[1] && matched[2]) {
      out.set(matched[1], matched[2]);
    }
  }
  return out;
}

const theme = declarationsInRoot(stylesCss);

/** shadcn のセマンティックトークンを DADS の実際の色まで解決する。 */
function resolve(token: string): string {
  const value = theme.get(token);
  if (!value) {
    throw new Error(`${token} が styles.css の :root に無い`);
  }
  const indirection = value.match(/^var\((--[\w-]+)\)$/);
  if (!indirection?.[1]) {
    return value;
  }
  const dads = dadsCss.match(
    new RegExp(`^\\s*${indirection[1]}:\\s*(.+?);`, "m"),
  );
  if (!dads?.[1]) {
    throw new Error(`${indirection[1]} が DADS プラグインに無い`);
  }
  return dads[1];
}

describe("shadcn セマンティックトークンの DADS 割り当て", () => {
  // shadcn は面を重ねて状態を表す（Tabs の選択中タブは muted の上に background 色、
  // Message の吹き出しは card の上に muted）。重なる側と重ねられる側が同値になると、
  // 選択状態や面の境界が見えなくなる。SSR テストでも型検査でも検出できないので、
  // ここで値そのものを突き合わせる。
  test.each([
    ["--background", "--muted"],
    ["--card", "--muted"],
    ["--background", "--border"],
    ["--background", "--foreground"],
  ])("%s と %s は異なる色でなければならない", (a, b) => {
    expect(resolve(a)).not.toBe(resolve(b));
  });

  // shadcn の生成コンポーネントは `data-horizontal:` / `data-vertical:` という向きの
  // スタイルフックを使うが、Base UI が出すのは `data-orientation="..."`。対応する
  // `@custom-variant` が無いとクラスが生成されず、Tabs が横並びのままになる（レイアウトが
  // 崩れるだけでエラーにならないので、ビルドも型検査も通ってしまう）。
  test("生成コンポーネントが使う向きのスタイルフックが宣言されている", async () => {
    const uiDir = new URL("../components/ui/", import.meta.url);
    const used = new Set<string>();
    for (const name of [...new Bun.Glob("*.tsx").scanSync(uiDir.pathname)]) {
      const source = await Bun.file(new URL(name, uiDir)).text();
      for (const hook of source.match(/data-(?:horizontal|vertical)/g) ?? []) {
        used.add(hook);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const hook of used) {
      expect(stylesCss).toContain(`@custom-variant ${hook} (`);
    }
  });

  test("DADS のトークンを参照していて、生の16進数を増やしていない", () => {
    const rawHex = [...theme.entries()].filter(
      ([, value]) => /^#[0-9a-f]{3,8}$/i.test(value) && value !== "#fff",
    );
    expect(rawHex).toEqual([]);
  });
});
