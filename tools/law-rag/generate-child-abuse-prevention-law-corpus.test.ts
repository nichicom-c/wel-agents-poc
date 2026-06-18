import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  LawDataResponse,
  LawElement,
  LawNode,
} from "./generate-child-abuse-prevention-law-corpus.ts";
import {
  articleFileBase,
  assertLawDataShape,
  assertRevision,
  buildApiUrl,
  buildArticleMetadata,
  buildCorpus,
  countNodes,
  EXPECTED_REVISION_ID,
  MAX_METADATA_BYTES,
  metadataByteSize,
  normalizeOccasionDate,
  renderArticle,
  sourceNote,
} from "./generate-child-abuse-prevention-law-corpus.ts";

function el(
  tag: string,
  children: LawNode[],
  attr?: Record<string, string>,
): LawElement {
  return { tag, ...(attr ? { attr } : {}), children };
}

function sentence(text: string): LawElement {
  return el("Sentence", [text]);
}

function simpleArticle(
  num: string,
  title: string,
  text: string,
  caption?: string,
): LawElement {
  return el(
    "Article",
    [
      ...(caption ? [el("ArticleCaption", [caption])] : []),
      el("ArticleTitle", [title]),
      el(
        "Paragraph",
        [el("ParagraphNum", []), el("ParagraphSentence", [sentence(text)])],
        { Num: "1" },
      ),
    ],
    { Num: num },
  );
}

const ARTICLE_2 = el(
  "Article",
  [
    el("ArticleCaption", ["（児童虐待の定義）"]),
    el("ArticleTitle", ["第二条"]),
    el(
      "Paragraph",
      [
        el("ParagraphNum", []),
        el("ParagraphSentence", [
          sentence("この法律において、児童虐待とは、次に掲げる行為をいう。"),
        ]),
        el(
          "Item",
          [
            el("ItemTitle", ["一"]),
            el("ItemSentence", [
              sentence(
                "児童の身体に外傷が生じるおそれのある暴行を加えること。",
              ),
            ]),
          ],
          { Num: "1" },
        ),
      ],
      { Num: "1" },
    ),
    el(
      "Paragraph",
      [
        el("ParagraphNum", ["２"]),
        el("ParagraphSentence", [
          sentence("前項の児童とは、十八歳に満たない者をいう。"),
        ]),
      ],
      { Num: "2" },
    ),
  ],
  { Num: "2" },
);

const FIXTURE: LawDataResponse = {
  law_info: {
    law_id: "412AC1000000082",
    law_num: "平成十二年法律第八十二号",
    promulgation_date: "2000-05-24",
  },
  revision_info: {
    law_revision_id: EXPECTED_REVISION_ID,
    law_title: "児童虐待の防止等に関する法律",
    law_title_kana: "じどうぎゃくたいのぼうしとうにかんするほうりつ",
    abbrev: "児童虐待防止法",
    category: "社会福祉",
    amendment_enforcement_date: "2024-04-01",
    current_revision_status: "PreviousEnforced",
  },
  law_full_text: el("Law", [
    el("LawNum", ["平成十二年法律第八十二号"]),
    el("LawBody", [
      el("LawTitle", ["児童虐待の防止等に関する法律"]),
      el("MainProvision", [
        simpleArticle(
          "1",
          "第一条",
          "この法律は、児童虐待の防止に資することを目的とする。",
          "（目的）",
        ),
        ARTICLE_2,
        simpleArticle(
          "8_2",
          "第八条の二",
          "都道府県知事は、必要な措置を講ずるものとする。",
        ),
      ]),
      el(
        "SupplProvision",
        [
          el("SupplProvisionLabel", ["附則"]),
          simpleArticle(
            "1",
            "第一条",
            "この法律は、公布の日から起算して施行する。",
            "（施行期日）",
          ),
        ],
        { Extract: "true" },
      ),
    ]),
  ]),
};

describe("normalizeOccasionDate", () => {
  test("YYYYMMDD を YYYY-MM-DD に正規化する", () => {
    expect(normalizeOccasionDate("20250401")).toBe("2025-04-01");
  });

  test("不正な形式は明確に失敗する", () => {
    expect(() => normalizeOccasionDate("2025-04-01")).toThrow();
    expect(() => normalizeOccasionDate("abc")).toThrow();
  });
});

describe("buildApiUrl", () => {
  test("asof と full / 改正附則除外パラメータを含む", () => {
    const url = buildApiUrl("412AC1000000082", "2025-04-01");
    expect(url).toContain("/law_data/412AC1000000082");
    expect(url).toContain("asof=2025-04-01");
    expect(url).toContain("json_format=full");
    expect(url).toContain("omit_amendment_suppl_provision=true");
  });
});

describe("assertRevision", () => {
  test("一致すれば throw しない", () => {
    expect(() => assertRevision(EXPECTED_REVISION_ID)).not.toThrow();
  });

  test("不一致は明確なメッセージで失敗する", () => {
    expect(() => assertRevision("other_revision")).toThrow(/law_revision_id/);
  });

  test("allowChange=true なら不一致でも通す", () => {
    expect(() =>
      assertRevision("other_revision", EXPECTED_REVISION_ID, true),
    ).not.toThrow();
  });
});

describe("articleFileBase", () => {
  test("数値を 3 桁ゼロ埋めし枝番をハイフンにする", () => {
    expect(articleFileBase("1", "article-")).toBe("article-001");
    expect(articleFileBase("8_2", "article-")).toBe("article-008-2");
    expect(articleFileBase("10_6", "article-")).toBe("article-010-6");
    expect(articleFileBase("1", "suppl-article-")).toBe("suppl-article-001");
  });
});

describe("renderArticle", () => {
  test("見出しに法令名・条名・見出しを含む", () => {
    const rendered = renderArticle(ARTICLE_2, "児童虐待の防止等に関する法律");
    expect(rendered.markdown).toContain(
      "# 児童虐待の防止等に関する法律 第二条（児童虐待の定義）",
    );
  });

  test("第1項は条名、第2項以降は項番号を前置し、号はインデントする", () => {
    const rendered = renderArticle(ARTICLE_2, "児童虐待の防止等に関する法律");
    expect(rendered.markdown).toContain("第二条　この法律において、");
    expect(rendered.markdown).toContain("\n　一　児童の身体に外傷");
    expect(rendered.markdown).toContain("\n\n２　前項の児童とは、");
  });

  test("suppl では附則ラベルを見出しに含める", () => {
    const suppl = simpleArticle(
      "1",
      "第一条",
      "この法律は、施行する。",
      "（施行期日）",
    );
    const rendered = renderArticle(
      suppl,
      "児童虐待の防止等に関する法律",
      "suppl",
      "附則",
    );
    expect(rendered.markdown).toContain(
      "# 児童虐待の防止等に関する法律 附則 第一条（施行期日）",
    );
    expect(rendered.section).toBe("suppl");
  });

  test("末尾に出典・加工・主体・disclaimer 脚注を含む", () => {
    const rendered = renderArticle(
      ARTICLE_2,
      "児童虐待の防止等に関する法律",
      "main",
      undefined,
      "2025-04-01",
    );
    expect(rendered.markdown).toContain(sourceNote("2025-04-01"));
    expect(rendered.markdown).toContain("出典: デジタル庁 e-Gov 法令検索");
    expect(rendered.markdown).toContain("WEL Agents PoC が加工");
    expect(rendered.markdown).toContain("asof=2025-04-01");
    expect(rendered.markdown).toContain("法的助言ではない");
    // 本文が先頭に来る（脚注は末尾）。
    expect(rendered.markdown.indexOf("第二条　")).toBeLessThan(
      rendered.markdown.indexOf("出典:"),
    );
  });
});

describe("buildCorpus", () => {
  test("main + suppl の全条を chunk 化しファイル名と section を付与する", () => {
    const corpus = buildCorpus(FIXTURE);
    expect(corpus.map((c) => c.fileBase)).toEqual([
      "article-001",
      "article-002",
      "article-008-2",
      "suppl-article-001",
    ]);
    expect(corpus.map((c) => c.section)).toEqual([
      "main",
      "main",
      "main",
      "suppl",
    ]);
    expect(corpus[3]?.supplLabel).toBe("附則");
  });
});

describe("buildArticleMetadata", () => {
  const base = {
    response: FIXTURE,
    asof: "2025-04-01",
    sourceUrl:
      "https://laws.e-gov.go.jp/law/412AC1000000082?occasion_date=20250401",
  };

  test("filtering / citation に必須の最小キーだけを残す", () => {
    const corpus = buildCorpus(FIXTURE);
    const article1 = corpus[0];
    if (!article1) {
      throw new Error("fixture corpus is empty");
    }
    const { metadataAttributes } = buildArticleMetadata({
      ...base,
      rendered: article1,
    });
    expect(metadataAttributes).toEqual({
      law_id: "412AC1000000082",
      law_revision_id: EXPECTED_REVISION_ID,
      asof: "2025-04-01",
      section: "main",
      article: "第一条",
      article_num: "1",
      source_url:
        "https://laws.e-gov.go.jp/law/412AC1000000082?occasion_date=20250401",
    });
  });

  test("1KB を圧迫する冗長キーは sidecar から除外する", () => {
    const corpus = buildCorpus(FIXTURE);
    const article1 = corpus[0];
    if (!article1) {
      throw new Error("fixture corpus is empty");
    }
    const { metadataAttributes } = buildArticleMetadata({
      ...base,
      rendered: article1,
    });
    for (const removed of [
      "api_url",
      "processing",
      "processed_by",
      "attribution",
      "law_title",
      "law_title_kana",
      "law_num",
      "promulgation_date",
      "article_caption",
      "suppl_label",
    ]) {
      expect(metadataAttributes[removed]).toBeUndefined();
    }
  });

  test("生成される全 sidecar が Bedrock 上限 (1024 bytes) 未満である", () => {
    const corpus = buildCorpus(FIXTURE);
    for (const rendered of corpus) {
      const metadata = buildArticleMetadata({ ...base, rendered });
      expect(metadataByteSize(metadata)).toBeLessThan(MAX_METADATA_BYTES);
    }
  });

  test("metadataByteSize は 1024 bytes 超の metadata を検出する（guard 方向の固定）", () => {
    const oversized = {
      metadataAttributes: { law_id: "x", blob: "あ".repeat(2000) },
    };
    expect(metadataByteSize(oversized)).toBeGreaterThanOrEqual(
      MAX_METADATA_BYTES,
    );
  });
});

describe("assertLawDataShape", () => {
  test("期待する shape は通す", () => {
    expect(() => assertLawDataShape(FIXTURE)).not.toThrow();
  });

  test("object でなければ失敗する", () => {
    expect(() => assertLawDataShape(null)).toThrow();
    expect(() => assertLawDataShape("x")).toThrow();
  });

  test("law_info.law_id 欠落で失敗する", () => {
    const { law_info: _omit, ...rest } = FIXTURE;
    expect(() => assertLawDataShape(rest)).toThrow(/law_info/);
  });

  test("revision_info.law_revision_id 欠落で失敗する", () => {
    const broken = {
      ...FIXTURE,
      revision_info: { law_title: "x" },
    };
    expect(() => assertLawDataShape(broken)).toThrow(/revision_info/);
  });

  test("law_full_text の tag 欠落で失敗する", () => {
    const broken = { ...FIXTURE, law_full_text: {} };
    expect(() => assertLawDataShape(broken)).toThrow(/law_full_text/);
  });
});

describe("countNodes", () => {
  test("article / paragraph / sentence / supplProvision を数える", () => {
    expect(countNodes(FIXTURE)).toEqual({
      article: 4,
      paragraph: 5,
      sentence: 6,
      supplProvision: 1,
    });
  });
});

describe("生成済み corpus artifact", () => {
  const corpusDir = fileURLToPath(
    new URL(
      "../../terraform/aws/agentcore/data/law/child-abuse-prevention/2025-04-01/",
      import.meta.url,
    ),
  );
  const metadataFiles = readdirSync(corpusDir).filter((name) =>
    name.endsWith(".metadata.json"),
  );

  test("metadata sidecar が生成・コミットされている", () => {
    expect(metadataFiles.length).toBeGreaterThan(0);
  });

  test("全 *.metadata.json が UTF-8 で 1024 bytes 未満（Bedrock 上限）", () => {
    const oversize = metadataFiles
      .map((name) => ({
        name,
        bytes: statSync(`${corpusDir}${name}`).size,
      }))
      .filter((entry) => entry.bytes >= MAX_METADATA_BYTES);
    expect(oversize).toEqual([]);
  });

  test("各 sidecar は妥当な metadataAttributes JSON である", () => {
    for (const name of metadataFiles) {
      const parsed = JSON.parse(readFileSync(`${corpusDir}${name}`, "utf8"));
      expect(typeof parsed.metadataAttributes).toBe("object");
      expect(parsed.metadataAttributes.law_revision_id).toBe(
        EXPECTED_REVISION_ID,
      );
    }
  });
});
