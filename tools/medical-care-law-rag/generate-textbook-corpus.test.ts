import { describe, expect, test } from "bun:test";

import {
  assertManifestShape,
  assertOcrLangsAvailable,
  averageConfidenceFromTsv,
  buildPageMetadata,
  CORPUS_ID,
  classifyPageQuality,
  classifyPdf,
  DISCLAIMER,
  EXPECTED_TOTAL_PAGES,
  LOW_CHAR_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  MAX_METADATA_BYTES,
  metadataByteSize,
  type PagePlan,
  pageFileBase,
  parseChapterManifest,
  parseCliArgs,
  parseTesseractLangs,
  planPages,
  renderPageMarkdown,
  SOURCE_TITLE,
} from "./generate-textbook-corpus.ts";

/** fixture の指定通しページの plan を取り出す（無ければ fixture 不整合として失敗）。 */
function fixturePlanAt(index: number): PagePlan {
  const plan = planPages(parseChapterManifest(MANIFEST_FIXTURE).entries)[index];
  if (!plan) {
    throw new Error(`fixture のページ ${index} がありません。`);
  }
  return plan;
}

// 実 chapter_split_manifest.txt を縮約した固定 fixture（9PDF / 合計260ページ）。
const MANIFEST_FIXTURE = `保険診療 基本法令テキストブック PDF 章別分割マニフェスト
source: /Users/x/Downloads/01.pdf, 02.pdf, 03.pdf, 04.pdf
ranges: inclusive, 1-based source PDF pages

00_front_matter.pdf
  title: 表紙・はじめに・目次
  source ranges: 01.pdf:1-1, 02.pdf:1-5
  pages: 6

01_chapter-1_iryo-hoken-seido-no-gaiyo.pdf
  title: 第1章 医療保険制度の概要
  source ranges: 02.pdf:6-41, 03.pdf:1-53
  pages: 89

02_chapter-2_kohi-futan-iryo-seido-no-gaiyo.pdf
  title: 第2章 公費負担医療制度の概要
  source ranges: 03.pdf:54-65
  pages: 12

03_chapter-3_hoken-iryo-kikan-to-hokeni.pdf
  title: 第3章 保険医療機関と保険医
  source ranges: 03.pdf:66-77
  pages: 12

04_chapter-4_ryoyo-tanto-kisoku.pdf
  title: 第4章 療養担当規則
  source ranges: 03.pdf:78-85, 04.pdf:1-67
  pages: 75

05_chapter-5_shinryo-hoshu-seikyu-to-shinsa-seido.pdf
  title: 第5章 診療報酬請求と審査制度
  source ranges: 04.pdf:68-99
  pages: 32

06_chapter-6_iryo-kankei-hoki.pdf
  title: 第6章 医療関係法規
  source ranges: 04.pdf:100-123
  pages: 24

07_reference_kaigo-hoken-seido.pdf
  title: 参考 介護保険制度
  source ranges: 04.pdf:124-132
  pages: 9

99_colophon.pdf
  title: 奥付
  source ranges: 04.pdf:133-133
  pages: 1

total output pages: 260
total source pages: 260
`;

describe("classifyPdf", () => {
  test("section と章番号を判定する", () => {
    expect(classifyPdf("00_front_matter.pdf")).toEqual({
      section: "front_matter",
    });
    expect(classifyPdf("01_chapter-1_iryo-hoken-seido-no-gaiyo.pdf")).toEqual({
      section: "chapter",
      chapterNumber: 1,
    });
    expect(classifyPdf("06_chapter-6_iryo-kankei-hoki.pdf")).toEqual({
      section: "chapter",
      chapterNumber: 6,
    });
    expect(classifyPdf("07_reference_kaigo-hoken-seido.pdf")).toEqual({
      section: "reference",
    });
    expect(classifyPdf("99_colophon.pdf")).toEqual({ section: "colophon" });
  });

  test("判定できない PDF 名は throw する", () => {
    expect(() => classifyPdf("xx_unknown.pdf")).toThrow();
  });
});

describe("parseChapterManifest", () => {
  test("9 entry と宣言ページ数を読み取る", () => {
    const parsed = parseChapterManifest(MANIFEST_FIXTURE);
    expect(parsed.entries).toHaveLength(9);
    expect(parsed.declaredTotalOutputPages).toBe(EXPECTED_TOTAL_PAGES);

    const first = parsed.entries[0];
    expect(first?.pdfFile).toBe("00_front_matter.pdf");
    expect(first?.title).toBe("表紙・はじめに・目次");
    expect(first?.pages).toBe(6);
    expect(first?.section).toBe("front_matter");
    expect(first?.chapterNumber).toBeUndefined();

    const chapter1 = parsed.entries[1];
    expect(chapter1?.section).toBe("chapter");
    expect(chapter1?.chapterNumber).toBe(1);
    expect(chapter1?.sourceRanges).toBe("02.pdf:6-41, 03.pdf:1-53");

    expect(parsed.entries.reduce((acc, e) => acc + e.pages, 0)).toBe(
      EXPECTED_TOTAL_PAGES,
    );
  });
});

describe("assertManifestShape", () => {
  test("期待形状なら通る", () => {
    expect(() =>
      assertManifestShape(parseChapterManifest(MANIFEST_FIXTURE)),
    ).not.toThrow();
  });

  test("PDF 数が足りなければ throw する", () => {
    const parsed = parseChapterManifest(MANIFEST_FIXTURE);
    parsed.entries.pop();
    expect(() => assertManifestShape(parsed)).toThrow(/PDF 数/);
  });

  test("ページ合計が 260 でなければ throw する", () => {
    const parsed = parseChapterManifest(MANIFEST_FIXTURE);
    const first = parsed.entries[0];
    if (first) {
      first.pages = 5;
    }
    expect(() => assertManifestShape(parsed)).toThrow(/ページ合計/);
  });
});

describe("pageFileBase", () => {
  test("section / chapter / ページ番号でファイル名 base を作る", () => {
    expect(pageFileBase("front_matter", undefined, 1)).toBe(
      "front-matter-page-001",
    );
    expect(pageFileBase("chapter", 1, 7)).toBe("chapter-01-page-007");
    expect(pageFileBase("chapter", 6, 227)).toBe("chapter-06-page-227");
    expect(pageFileBase("reference", undefined, 251)).toBe(
      "reference-page-251",
    );
    expect(pageFileBase("colophon", undefined, 260)).toBe("colophon-page-260");
  });

  test("chapter section で chapterNumber が無ければ throw する", () => {
    expect(() => pageFileBase("chapter", undefined, 1)).toThrow();
  });
});

describe("planPages", () => {
  const plans = planPages(parseChapterManifest(MANIFEST_FIXTURE).entries);

  test("全260ページを通しページ番号付きで展開する", () => {
    expect(plans).toHaveLength(EXPECTED_TOTAL_PAGES);
    expect(plans[0]?.outputPage).toBe(1);
    expect(plans.at(-1)?.outputPage).toBe(EXPECTED_TOTAL_PAGES);
    // 通しページ番号が 1..260 で連続している。
    plans.forEach((plan, index) => {
      expect(plan.outputPage).toBe(index + 1);
    });
  });

  test("front matter の最初と colophon の最後を正しく割り当てる", () => {
    const first = plans[0];
    expect(first?.section).toBe("front_matter");
    expect(first?.sourceFile).toBe("00_front_matter.pdf");
    expect(first?.sourcePage).toBe(1);
    expect(first?.fileBase).toBe("front-matter-page-001");

    const last = plans.at(-1);
    expect(last?.section).toBe("colophon");
    expect(last?.sourcePage).toBe(1);
    expect(last?.fileBase).toBe("colophon-page-260");
  });

  test("chapter 1 は出力ページ 7 から始まる（front matter 6 ページの後）", () => {
    const chapter1First = plans[6];
    expect(chapter1First?.section).toBe("chapter");
    expect(chapter1First?.chapter).toBe("1");
    expect(chapter1First?.outputPage).toBe(7);
    expect(chapter1First?.sourcePage).toBe(1);
    expect(chapter1First?.fileBase).toBe("chapter-01-page-007");
  });
});

describe("parseTesseractLangs / assertOcrLangsAvailable", () => {
  const LIST_OUTPUT = `List of available languages in "/opt/homebrew/share/tessdata/" (4):
eng
jpn
osd
snum`;

  test("--list-langs の出力から language コードを取り出す", () => {
    expect(parseTesseractLangs(LIST_OUTPUT)).toEqual([
      "eng",
      "jpn",
      "osd",
      "snum",
    ]);
  });

  test("必要な language が揃っていれば通る", () => {
    expect(() =>
      assertOcrLangsAvailable(parseTesseractLangs(LIST_OUTPUT), "jpn+eng"),
    ).not.toThrow();
  });

  test("jpn が無ければ欠けた language を明示して throw する（fail-fast）", () => {
    expect(() =>
      assertOcrLangsAvailable(["eng", "osd", "snum"], "jpn+eng"),
    ).toThrow(/jpn/);
  });
});

describe("classifyPageQuality", () => {
  test("空ページ・低テキスト・低信頼度を判定する", () => {
    expect(classifyPageQuality(0, undefined)).toEqual({
      empty: true,
      lowText: false,
      lowConfidence: false,
    });
    expect(classifyPageQuality(LOW_CHAR_THRESHOLD - 1, 90)).toEqual({
      empty: false,
      lowText: true,
      lowConfidence: false,
    });
    expect(
      classifyPageQuality(500, LOW_CONFIDENCE_THRESHOLD - 1).lowConfidence,
    ).toBe(true);
    expect(classifyPageQuality(500, 95)).toEqual({
      empty: false,
      lowText: false,
      lowConfidence: false,
    });
  });
});

describe("averageConfidenceFromTsv", () => {
  test("word 単位 conf の平均を計算し、無効行は除外する", () => {
    const tsv = [
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t90\t保険",
      "5\t1\t1\t1\t1\t2\t0\t0\t10\t10\t80\t診療",
      "5\t1\t1\t1\t1\t3\t0\t0\t10\t10\t-1\t",
    ].join("\n");
    expect(averageConfidenceFromTsv(tsv)).toBe(85);
  });

  test("有効な word が無ければ undefined", () => {
    expect(averageConfidenceFromTsv("level\tpage_num")).toBeUndefined();
  });
});

describe("buildPageMetadata / metadataByteSize", () => {
  const plan = fixturePlanAt(6);
  const metadata = buildPageMetadata({
    plan,
    ocrEngine: "tesseract",
    ocrLang: "jpn+eng",
    generatedAt: "2026-06-16T00:00:00.000Z",
  });

  test("citation / filter に必要な最小 key を持つ", () => {
    expect(metadata.metadataAttributes).toMatchObject({
      corpus_id: CORPUS_ID,
      source_title: SOURCE_TITLE,
      section: "chapter",
      chapter: "1",
      source_file: "01_chapter-1_iryo-hoken-seido-no-gaiyo.pdf",
      output_page: "7",
      ocr_engine: "tesseract",
      ocr_lang: "jpn+eng",
    });
  });

  test("Bedrock の byte 上限を下回る", () => {
    expect(metadataByteSize(metadata)).toBeLessThan(MAX_METADATA_BYTES);
  });
});

describe("renderPageMarkdown", () => {
  test("見出し・OCR 本文・出典/disclaimer ブロックを含む", () => {
    const plan = fixturePlanAt(6);
    const md = renderPageMarkdown({
      plan,
      ocrText: "  医療保険制度の概要  ",
      ocrEngine: "tesseract",
      ocrLang: "jpn+eng",
      generatedAt: "2026-06-16T00:00:00.000Z",
    });
    expect(md).toContain(`# ${SOURCE_TITLE}`);
    expect(md).toContain("医療保険制度の概要");
    expect(md).toContain("source: 01_chapter-1_iryo-hoken-seido-no-gaiyo.pdf");
    expect(md).toContain(DISCLAIMER);
  });
});

describe("parseCliArgs", () => {
  test("既定値と上書きを解釈する", () => {
    expect(parseCliArgs([])).toEqual({
      inputDir: "tmp/保険診療基本法令テキストブック",
      lang: "jpn+eng",
      dpi: 300,
      psm: undefined,
      tessdataDir: undefined,
      allowEmptyPages: false,
    });
    expect(
      parseCliArgs([
        "--input-dir=/tmp/x",
        "--lang=jpn",
        "--dpi=400",
        "--psm=6",
        "--tessdata-dir=tmp/tessdata-best",
        "--allow-empty-pages",
      ]),
    ).toEqual({
      inputDir: "/tmp/x",
      lang: "jpn",
      dpi: 400,
      psm: 6,
      tessdataDir: "tmp/tessdata-best",
      allowEmptyPages: true,
    });
  });
});
