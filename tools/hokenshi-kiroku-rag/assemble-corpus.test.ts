import { describe, expect, test } from "bun:test";

import {
  CONVERSION,
  CORPUS_ID,
  classify,
  DISCLAIMER,
  fileNameFor,
  foldImages,
  renderMetadata,
  renderPage,
  SOURCE_FILE,
  SOURCE_TITLE,
  splitPages,
  TOTAL_PAGES,
  UNITS,
  unitFor,
  unitLabel,
} from "./assemble-corpus.ts";

const GENERATED_AT = "2026-11-10T00:00:00.000Z";

describe("UNITS", () => {
  test("1 から TOTAL_PAGES までを隙間・重複なく覆う", () => {
    const covered: number[] = [];
    for (const unit of UNITS) {
      for (let page = unit.from; page <= unit.to; page++) {
        covered.push(page);
      }
    }
    expect(covered).toEqual(
      Array.from({ length: TOTAL_PAGES }, (_value, index) => index + 1),
    );
  });

  test("範囲は昇順で from <= to", () => {
    for (const unit of UNITS) {
      expect(unit.to).toBeGreaterThanOrEqual(unit.from);
    }
  });
});

describe("unitFor / unitLabel / fileNameFor", () => {
  test("本文ページは編・単元番号つきのラベルとファイル名になる", () => {
    const unit = unitFor(51);
    expect(unit.section.slug).toBe("jissen");
    expect(unit.number).toBe(3);
    expect(unitLabel(unit)).toBe("実践編3 精神障害者のインテーク面接の記録");
    expect(fileNameFor(51, unit)).toBe("jissen-03-page-051.md");
  });

  test("番号を持たない区分は編名だけのラベル・ファイル名になる", () => {
    const divider = unitFor(9);
    expect(unitLabel(divider)).toBe("基礎編");
    expect(fileNameFor(9, divider)).toBe("kiso-page-009.md");

    const toc = unitFor(5);
    expect(unitLabel(toc)).toBe("前付 目次");
    expect(fileNameFor(5, toc)).toBe("front-matter-page-005.md");
  });

  test("範囲外のページは失敗する", () => {
    expect(() => unitFor(TOTAL_PAGES + 1)).toThrow();
  });
});

describe("foldImages", () => {
  test("alt text を残して path を落とす", () => {
    expect(foldImages("![表8 記録の注意点](../images/page-030-fig1.png)")).toBe(
      "（図: 表8 記録の注意点）",
    );
  });

  test("alt が空なら図の注記だけ残す", () => {
    expect(foldImages("![](images/page-001-fig1.png)")).toBe("（図）");
  });

  test("画像を含まない本文は変えない", () => {
    expect(foldImages("保健師記録のガイドライン")).toBe(
      "保健師記録のガイドライン",
    );
  });
});

describe("classify", () => {
  test("単元が固定 content_type を持つならそれを使う", () => {
    expect(classify(unitFor(5), "目次", "目次")).toBe("toc");
    expect(classify(unitFor(9), "## 基礎編", "## 基礎編")).toBe(
      "section_divider",
    );
    expect(classify(unitFor(171), "## 索引", "## 索引")).toBe("index");
  });

  test("本文が無いページは blank", () => {
    expect(classify(unitFor(51), "", "")).toBe("blank");
  });

  test("画像しか無いページは figure_or_form", () => {
    const raw =
      "**基本情報記録**\n\n![精神保健 基本情報記録](../images/page-157-fig1.png)\n";
    expect(classify(unitFor(157), raw, foldImages(raw))).toBe("figure_or_form");
  });

  test("画像つきでも本文が十分にあるページは body", () => {
    const raw = `![図](../images/x.png)\n\n${"保健師記録は実践の根拠である。".repeat(10)}`;
    expect(classify(unitFor(51), raw, foldImages(raw))).toBe("body");
  });
});

describe("renderPage", () => {
  const unit = unitFor(51);

  test("見出し・本文・脚注ブロックを組み立てる", () => {
    const markdown = renderPage(51, unit, "本文テキスト", GENERATED_AT);
    expect(markdown).toBe(
      `# ${SOURCE_TITLE}｜実践編3 精神障害者のインテーク面接の記録（ページ 51）\n\n` +
        "本文テキスト\n\n---\n\n" +
        `> 出典: ${SOURCE_TITLE}（実践編3 精神障害者のインテーク面接の記録） / ` +
        `source: ${SOURCE_FILE} p.51 / ページ 51 / 変換: ${CONVERSION} / 生成: ${GENERATED_AT}\n` +
        `> ${DISCLAIMER}\n`,
    );
  });

  test("本文が空なら定型文を置く", () => {
    expect(renderPage(51, unit, "   ", GENERATED_AT)).toContain(
      "このページには本文がありません。",
    );
  });
});

describe("renderMetadata", () => {
  test("Bedrock の metadataAttributes を組み立てる", () => {
    const metadata = JSON.parse(
      renderMetadata(51, unitFor(51), "body", GENERATED_AT),
    );
    expect(metadata.metadataAttributes).toEqual({
      corpus_id: CORPUS_ID,
      source_title: SOURCE_TITLE,
      section: "jissen",
      section_title: "実践編",
      unit: "3",
      unit_title: "精神障害者のインテーク面接の記録",
      source_file: SOURCE_FILE,
      source_page: "51",
      output_page: "51",
      conversion: CONVERSION,
      generated_at: GENERATED_AT,
      content_type: "body",
    });
  });

  test("番号を持たない区分は unit / unit_title の key ごと落とす", () => {
    const metadata = JSON.parse(
      renderMetadata(9, unitFor(9), "section_divider", GENERATED_AT),
    );
    expect(Object.keys(metadata.metadataAttributes)).not.toContain("unit");
    expect(Object.keys(metadata.metadataAttributes)).not.toContain(
      "unit_title",
    );
  });

  test("番号は無いが単元名を持つ区分は unit_title だけ残す", () => {
    const metadata = JSON.parse(
      renderMetadata(5, unitFor(5), "toc", GENERATED_AT),
    );
    expect(Object.keys(metadata.metadataAttributes)).not.toContain("unit");
    expect(metadata.metadataAttributes.unit_title).toBe("目次");
  });

  test("空文字の値を持つ属性を 1 つも含まない", () => {
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      const metadata = JSON.parse(
        renderMetadata(page, unitFor(page), "body", GENERATED_AT),
      );
      for (const [key, value] of Object.entries(metadata.metadataAttributes)) {
        expect(`${key}=${value}`).not.toBe(`${key}=`);
      }
    }
  });
});

describe("splitPages", () => {
  test("pdf-page コメントでページに分解する", () => {
    const pages = splitPages(
      "<!-- pdf-page: 1 -->\n\n表紙\n\n<!-- pdf-page: 2 -->\n\n本文\n",
    );
    expect([...pages.keys()]).toEqual([1, 2]);
    expect(pages.get(2)?.trim()).toBe("本文");
  });

  test("先頭コメントより前に本文があれば失敗する", () => {
    expect(() =>
      splitPages("はみ出した本文\n<!-- pdf-page: 1 -->\n表紙\n"),
    ).toThrow();
  });

  test("ページ番号が重複していれば失敗する", () => {
    expect(() =>
      splitPages("<!-- pdf-page: 1 -->\nA\n<!-- pdf-page: 1 -->\nB\n"),
    ).toThrow();
  });
});
