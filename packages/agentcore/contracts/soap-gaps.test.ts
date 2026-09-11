import { describe, expect, test } from "bun:test";

import {
  type AiDetectedGap,
  aiDetectedGapSchema,
  aiGapDetectionOutputSchema,
  type Gap,
  gapSchema,
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
