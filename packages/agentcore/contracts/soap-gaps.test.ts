import { describe, expect, test } from "bun:test";

import {
  type AiDetectedGap,
  type AiGapQuestion,
  aiDetectedGapSchema,
  aiGapDetectionOutputSchema,
  aiGapQuestionListSchema,
  aiGapQuestionSchema,
  type Gap,
  gapQuestionSchema,
  gapSchema,
  type SoapGapsOutput,
  soapGapsOutputSchema,
} from "./soap-gaps.ts";

const VALID_GAP: Gap = {
  gapType: "missing_required",
  soapCategory: "P",
  targetItem: "次回訪問",
  detail: "次回予定に実施日が明記されていません。",
  relatedEvidenceQuotes: ["来月また様子を見に伺います"],
  skippable: false,
};

describe("gapSchema", () => {
  test("有効な不足を parse できる", () => {
    expect(gapSchema.parse(VALID_GAP)).toEqual(VALID_GAP);
  });

  test("不正な gapType は失敗する", () => {
    expect(
      gapSchema.safeParse({ ...VALID_GAP, gapType: "unknown_type" }).success,
    ).toBe(false);
  });

  test("relatedEvidenceQuotes が空配列だと失敗する", () => {
    expect(
      gapSchema.safeParse({ ...VALID_GAP, relatedEvidenceQuotes: [] }).success,
    ).toBe(false);
  });

  test("detail / targetItem が空文字だと失敗する", () => {
    expect(gapSchema.safeParse({ ...VALID_GAP, detail: "" }).success).toBe(
      false,
    );
    expect(gapSchema.safeParse({ ...VALID_GAP, targetItem: "" }).success).toBe(
      false,
    );
  });
});

describe("gapQuestionSchema", () => {
  test("有効な質問を parse できる", () => {
    const question = {
      gapType: VALID_GAP.gapType,
      soapCategory: VALID_GAP.soapCategory,
      targetItem: VALID_GAP.targetItem,
      questionText: "次回訪問の実施日はいつですか？",
      skippable: false,
    };
    expect(gapQuestionSchema.parse(question)).toEqual(question);
  });

  test("questionText が空文字だと失敗する", () => {
    expect(
      gapQuestionSchema.safeParse({
        gapType: VALID_GAP.gapType,
        soapCategory: VALID_GAP.soapCategory,
        targetItem: VALID_GAP.targetItem,
        questionText: "",
        skippable: false,
      }).success,
    ).toBe(false);
  });
});

describe("aiGapQuestionSchema / aiGapQuestionListSchema", () => {
  test("skippable を含まなくても有効", () => {
    const aiQuestion: AiGapQuestion = {
      gapType: VALID_GAP.gapType,
      soapCategory: VALID_GAP.soapCategory,
      targetItem: VALID_GAP.targetItem,
      questionText: "次回訪問の実施日はいつですか？",
    };
    expect(aiGapQuestionSchema.parse(aiQuestion)).toEqual(aiQuestion);
    expect(
      aiGapQuestionListSchema.safeParse({ questions: [aiQuestion] }).success,
    ).toBe(true);
  });

  test("questions が空配列でも有効", () => {
    expect(aiGapQuestionListSchema.safeParse({ questions: [] }).success).toBe(
      true,
    );
  });
});

describe("aiDetectedGapSchema / aiGapDetectionOutputSchema", () => {
  test("skippable を含まなくても有効", () => {
    const detected: AiDetectedGap = {
      gapType: "insufficient_reasoning",
      soapCategory: "A",
      targetItem: "栄養状態は良好である。",
      detail:
        "本人は元気そうだったという情報だけでは栄養状態良好の根拠として不十分です。",
      relatedEvidenceQuotes: ["元気そうだった"],
    };
    expect(aiDetectedGapSchema.parse(detected)).toEqual(detected);
    expect(
      aiGapDetectionOutputSchema.safeParse({ gaps: [detected] }).success,
    ).toBe(true);
  });

  test("gaps が空配列でも有効", () => {
    expect(aiGapDetectionOutputSchema.safeParse({ gaps: [] }).success).toBe(
      true,
    );
  });

  test("relatedEvidenceQuotes が空配列だと失敗する", () => {
    expect(
      aiDetectedGapSchema.safeParse({
        gapType: "ambiguous",
        soapCategory: "S",
        targetItem: "x",
        detail: "x",
        relatedEvidenceQuotes: [],
      }).success,
    ).toBe(false);
  });
});

describe("soapGapsOutputSchema", () => {
  test("gaps と questions を parse できる", () => {
    const output: SoapGapsOutput = {
      gaps: [VALID_GAP],
      questions: [
        {
          gapType: VALID_GAP.gapType,
          soapCategory: VALID_GAP.soapCategory,
          targetItem: VALID_GAP.targetItem,
          questionText: "次回訪問の実施日はいつですか？",
          skippable: false,
        },
      ],
    };
    expect(soapGapsOutputSchema.parse(output)).toEqual(output);
  });

  test("gaps / questions とも空配列で有効", () => {
    expect(
      soapGapsOutputSchema.safeParse({ gaps: [], questions: [] }).success,
    ).toBe(true);
  });

  test("gaps / questions 欠落は失敗する", () => {
    expect(soapGapsOutputSchema.safeParse({ gaps: [] }).success).toBe(false);
    expect(soapGapsOutputSchema.safeParse({ questions: [] }).success).toBe(
      false,
    );
  });
});
