import { describe, expect, test } from "bun:test";

import type { SoapDraftCandidate } from "../contracts/soap-draft.ts";
import type { AiDetectedGap, Gap } from "../contracts/soap-gaps.ts";
import {
  buildFallbackQuestion,
  defaultSkippableForGapType,
  detectGaps,
  fallbackQuestionText,
  getSoapGapsCandidates,
  isSoapGapsRequest,
  MAX_QUESTIONS,
  mergeGapLists,
  prioritizeGaps,
  toGap,
} from "./soap-gaps.ts";

function candidate(
  overrides: Partial<SoapDraftCandidate> = {},
): SoapDraftCandidate {
  return {
    category: "S",
    draftText: "利用者は落ち着いている様子だった。",
    evidenceQuote: "落ち着いている様子だった",
    reasoning: "本人の様子の記述。",
    confidence: 0.8,
    ...overrides,
  };
}

describe("isSoapGapsRequest / getSoapGapsCandidates", () => {
  test("type: soap_gaps のときだけ true", () => {
    expect(isSoapGapsRequest({ type: "soap_gaps" })).toBe(true);
    expect(isSoapGapsRequest({})).toBe(false);
    expect(isSoapGapsRequest({ type: "soap_draft" })).toBe(false);
  });

  test("有効な candidates 配列を返す / 無効なら undefined", () => {
    const valid = [candidate()];
    expect(getSoapGapsCandidates({ candidates: valid })).toEqual(valid);
    expect(getSoapGapsCandidates({})).toBeUndefined();
    expect(getSoapGapsCandidates({ candidates: [] })).toBeUndefined();
    expect(
      getSoapGapsCandidates({ candidates: "not-an-array" }),
    ).toBeUndefined();
    expect(
      getSoapGapsCandidates({
        candidates: [{ category: "S", draftText: "x" }],
      }),
    ).toBeUndefined();
  });
});

describe("detectGaps: insufficient_reasoning", () => {
  test("A があり S/O が一件も無ければ根拠不足として検出する", () => {
    const candidates = [
      candidate({ category: "A", draftText: "リスクが高い" }),
    ];
    const gaps = detectGaps(candidates);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      gapType: "insufficient_reasoning",
      soapCategory: "A",
      skippable: false,
    });
  });

  test("S または O が一件でもあれば検出しない", () => {
    const candidates = [
      candidate({ category: "A", draftText: "リスクが高い" }),
      candidate({ category: "S", draftText: "眠れていないと話した" }),
    ];
    expect(
      detectGaps(candidates).filter(
        (g) => g.gapType === "insufficient_reasoning",
      ),
    ).toHaveLength(0);
  });

  test("A が無ければ検出しない", () => {
    expect(detectGaps([candidate({ category: "S" })])).toHaveLength(0);
  });
});

describe("detectGaps: 次回予定の不足", () => {
  test("次回予定らしい P に日付・方法・担当者が無ければすべて検出する", () => {
    const candidates = [
      candidate({
        category: "P",
        draftText: "次回、改めて連絡する。",
        evidenceQuote: "次回、改めて連絡する",
      }),
    ];
    const gaps = detectGaps(candidates);
    const expectedTypes: Gap["gapType"][] = [
      "missing_recommended",
      "missing_recommended",
      "missing_required",
    ];
    expect(gaps.map((g) => g.gapType).sort()).toEqual(expectedTypes.sort());
  });

  test("日付・方法・担当者がすべて明記されていれば検出しない", () => {
    const candidates = [
      candidate({
        category: "P",
        draftText: "来月10日に担当のケアマネが訪問する予定。",
        evidenceQuote: "来月10日に担当のケアマネが訪問する予定",
      }),
    ];
    expect(
      detectGaps(candidates).filter((g) => g.soapCategory === "P"),
    ).toHaveLength(0);
  });

  test("次回予定に関係しない P は対象外", () => {
    const candidates = [
      candidate({
        category: "P",
        draftText: "本人の希望を尊重する方針とする。",
        evidenceQuote: "本人の希望を尊重する方針とする",
      }),
    ];
    expect(detectGaps(candidates)).toHaveLength(0);
  });
});

describe("detectGaps: ambiguous", () => {
  test("曖昧な表現を含む候補を検出する", () => {
    const candidates = [
      candidate({
        draftText: "しばらく様子を見ることにした。かもしれない状況。",
      }),
    ];
    const gaps = detectGaps(candidates).filter(
      (g) => g.gapType === "ambiguous",
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.skippable).toBe(true);
  });

  test("曖昧な表現が無ければ検出しない", () => {
    const candidates = [candidate({ draftText: "体温は36.5度だった。" })];
    expect(
      detectGaps(candidates).filter((g) => g.gapType === "ambiguous"),
    ).toHaveLength(0);
  });
});

describe("detectGaps: contradictory", () => {
  test("対義語ペアが異なる候補にまたがって出現すると検出する", () => {
    const candidates = [
      candidate({
        category: "O",
        draftText: "歩行状態は改善している。",
        evidenceQuote: "歩行状態は改善している",
      }),
      candidate({
        category: "A",
        draftText: "歩行状態は悪化している。",
        evidenceQuote: "歩行状態は悪化している",
      }),
    ];
    const gaps = detectGaps(candidates).filter(
      (g) => g.gapType === "contradictory",
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.relatedEvidenceQuotes).toHaveLength(2);
    expect(gaps[0]?.skippable).toBe(false);
  });

  test("対義語が出現しなければ検出しない", () => {
    const candidates = [
      candidate({ draftText: "体調は落ち着いている。" }),
      candidate({ category: "O", draftText: "食欲は普通だった。" }),
    ];
    expect(
      detectGaps(candidates).filter((g) => g.gapType === "contradictory"),
    ).toHaveLength(0);
  });
});

describe("detectGaps: review_recommended", () => {
  test("UNCLASSIFIED は確認推奨として検出する", () => {
    const candidates = [candidate({ category: "UNCLASSIFIED" })];
    const gaps = detectGaps(candidates).filter(
      (g) => g.gapType === "review_recommended",
    );
    expect(gaps).toHaveLength(1);
  });

  test("低信頼度は確認推奨として検出する", () => {
    const candidates = [candidate({ confidence: 0.1 })];
    const gaps = detectGaps(candidates).filter(
      (g) => g.gapType === "review_recommended",
    );
    expect(gaps).toHaveLength(1);
  });

  test("高信頼度で分類済みなら検出しない", () => {
    const candidates = [candidate({ confidence: 0.9 })];
    expect(
      detectGaps(candidates).filter((g) => g.gapType === "review_recommended"),
    ).toHaveLength(0);
  });
});

describe("prioritizeGaps", () => {
  const GAP_BY_TYPE = (gapType: Gap["gapType"]): Gap => ({
    gapType,
    soapCategory: "S",
    targetItem: gapType,
    detail: gapType,
    relatedEvidenceQuotes: ["x"],
    skippable: true,
  });

  test("必須不足・根拠不足・矛盾・曖昧・推奨不足・確認推奨の順に並べる", () => {
    const gaps = [
      GAP_BY_TYPE("review_recommended"),
      GAP_BY_TYPE("missing_recommended"),
      GAP_BY_TYPE("ambiguous"),
      GAP_BY_TYPE("contradictory"),
      GAP_BY_TYPE("insufficient_reasoning"),
      GAP_BY_TYPE("missing_required"),
    ];
    expect(prioritizeGaps(gaps).map((g) => g.gapType)).toEqual([
      "missing_required",
      "insufficient_reasoning",
      "contradictory",
      "ambiguous",
      "missing_recommended",
      "review_recommended",
    ]);
  });

  test("limit で上位件数だけに絞る（既定値は MAX_QUESTIONS）", () => {
    const gaps = Array.from({ length: MAX_QUESTIONS + 5 }, () =>
      GAP_BY_TYPE("review_recommended"),
    );
    expect(prioritizeGaps(gaps)).toHaveLength(MAX_QUESTIONS);
    expect(prioritizeGaps(gaps, 2)).toHaveLength(2);
  });
});

describe("defaultSkippableForGapType / toGap", () => {
  test("必須不足・根拠不足・矛盾はスキップ不可、それ以外はスキップ可", () => {
    expect(defaultSkippableForGapType("missing_required")).toBe(false);
    expect(defaultSkippableForGapType("insufficient_reasoning")).toBe(false);
    expect(defaultSkippableForGapType("contradictory")).toBe(false);
    expect(defaultSkippableForGapType("ambiguous")).toBe(true);
    expect(defaultSkippableForGapType("missing_recommended")).toBe(true);
    expect(defaultSkippableForGapType("review_recommended")).toBe(true);
  });

  test("AI 検出結果に gapType から導出した skippable を付与する", () => {
    const detected: AiDetectedGap = {
      gapType: "insufficient_reasoning",
      soapCategory: "A",
      targetItem: "栄養状態は良好である。",
      detail: "元気そうだったという情報だけでは根拠として不十分です。",
      relatedEvidenceQuotes: ["元気そうだった"],
    };
    expect(toGap(detected)).toEqual({ ...detected, skippable: false });
  });
});

describe("mergeGapLists", () => {
  const RULE_GAP: Gap = {
    gapType: "missing_required",
    soapCategory: "P",
    targetItem: "次回また連絡する。",
    detail: "次回予定に実施日が明記されていません。",
    relatedEvidenceQuotes: ["次回また連絡する"],
    skippable: false,
  };

  test("重複しない AI 検出結果はそのまま追加する", () => {
    const aiGap: Gap = {
      gapType: "insufficient_reasoning",
      soapCategory: "A",
      targetItem: "栄養状態は良好である。",
      detail: "元気そうだったという情報だけでは根拠として不十分です。",
      relatedEvidenceQuotes: ["元気そうだった"],
      skippable: false,
    };
    expect(mergeGapLists([RULE_GAP], [aiGap])).toEqual([RULE_GAP, aiGap]);
  });

  test("同じ (gapType, soapCategory, targetItem) の AI 検出結果は重複として落とす", () => {
    const duplicate: Gap = {
      ...RULE_GAP,
      detail: "AI が別の言い回しで検出した同じ不足。",
    };
    expect(mergeGapLists([RULE_GAP], [duplicate])).toEqual([RULE_GAP]);
  });
});

describe("fallbackQuestionText / buildFallbackQuestion", () => {
  test("gapType のラベルと detail を含む質問文を組み立てる", () => {
    const gap: Gap = {
      gapType: "insufficient_reasoning",
      soapCategory: "A",
      targetItem: "リスクが高い",
      detail: "アセスメントの根拠が不足しています。",
      relatedEvidenceQuotes: ["リスクが高い"],
      skippable: false,
    };
    const text = fallbackQuestionText(gap);
    expect(text).toContain("判断根拠が不足しています");
    expect(text).toContain(gap.detail);

    const question = buildFallbackQuestion(gap);
    expect(question).toEqual({
      gapType: gap.gapType,
      soapCategory: gap.soapCategory,
      targetItem: gap.targetItem,
      questionText: text,
      skippable: gap.skippable,
    });
  });
});
