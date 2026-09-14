import { describe, expect, test } from "bun:test";
import { compileDatePattern, renderTemplate } from "./soap-gap-rules.ts";

describe("renderTemplate", () => {
  test("{key} 形式のプレースホルダを置換する", () => {
    expect(
      renderTemplate("「{draftText}」に{keyword}があります。", {
        draftText: "様子を見る",
        keyword: "曖昧な表現",
      }),
    ).toBe("「様子を見る」に曖昧な表現があります。");
  });

  test("対応する変数が無いプレースホルダはそのまま残す", () => {
    expect(renderTemplate("{unknown}", {})).toBe("{unknown}");
  });
});

describe("compileDatePattern", () => {
  test("有効な正規表現文字列はそのままコンパイルする", () => {
    const pattern = compileDatePattern("来週|来月");
    expect(pattern.test("来週訪問予定")).toBe(true);
    expect(pattern.test("特に予定なし")).toBe(false);
  });

  test("不正な正規表現は既定の日付パターンにフォールバックする", () => {
    const pattern = compileDatePattern("(未閉じの括弧");
    expect(pattern.test("来週訪問予定")).toBe(true);
  });
});
