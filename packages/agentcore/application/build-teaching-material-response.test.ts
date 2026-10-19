import { describe, expect, test } from "bun:test";
import { StructuredOutputError } from "@strands-agents/sdk";

import type { TeachingMaterialOutput } from "../contracts/teaching-material.ts";
import {
  getTeachingMaterialClassificationOptions,
  getTeachingMaterialSourceText,
  isTeachingMaterialRequest,
  pickKnownOptionId,
} from "../domain/teaching-material.ts";
import type { Config } from "../infra/config.ts";
import { buildTeachingMaterialResponse } from "./build-teaching-material-response.ts";

function makeConfig(modelId = "test-model"): Config {
  return {
    modelId,
    region: "ap-northeast-1",
    kbIds: { database: "", document: "", law: "", medical_care_law: "" },
    memoryId: undefined,
    numberOfResults: 5,
    supportActivity: { kbId: "", kbArn: "", includeGeneratedSql: false },
  };
}

const OUTPUT: TeachingMaterialOutput = {
  title: "血圧高値と生活背景の統合",
  summary: "単回の血圧高値から生活背景を確認せずに指導へ進んだ場面の教材",
  learningObjective:
    "不足情報を確認し、S/Oを関連付けてAssessmentできるようになる",
  teachingPoints: ["単回の測定値だけで結論を出さない", "不足情報を明確にする"],
};

const CLASSIFICATION_OPTIONS = {
  specialties: [
    { id: "sp-adult", label: "成人保健" },
    { id: "sp-maternal", label: "母子保健" },
  ],
  learningThemes: [{ id: "th-assessment", label: "アセスメント" }],
  difficultyLevels: [{ id: "df-basic", label: "基礎" }],
};

/** 渡されたメッセージを記録し固定 output を返す runner。 */
function fakeTeachingMaterialRunner(output: TeachingMaterialOutput = OUTPUT) {
  const messages: string[] = [];
  const run = async (message: string) => {
    messages.push(message);
    return output;
  };
  return { run, messages };
}

describe("isTeachingMaterialRequest / getTeachingMaterialSourceText", () => {
  test("type: teaching_material のときだけ true", () => {
    expect(isTeachingMaterialRequest({ type: "teaching_material" })).toBe(true);
    expect(isTeachingMaterialRequest({})).toBe(false);
    expect(isTeachingMaterialRequest({ type: "chat" })).toBe(false);
  });

  test("有効な text を trim して返す / 無効なら undefined", () => {
    expect(getTeachingMaterialSourceText({ text: "  hello  " })).toBe("hello");
    expect(getTeachingMaterialSourceText({})).toBeUndefined();
    expect(getTeachingMaterialSourceText({ text: "   " })).toBeUndefined();
    expect(getTeachingMaterialSourceText({ text: 123 })).toBeUndefined();
  });
});

describe("getTeachingMaterialClassificationOptions / pickKnownOptionId", () => {
  test("id/label が揃った選択肢だけを取り出す", () => {
    expect(
      getTeachingMaterialClassificationOptions({
        classification_options: {
          specialties: [
            { id: " sp-adult ", label: " 成人保健 " },
            { id: "sp-broken" },
            "not-an-option",
          ],
        },
      }),
    ).toEqual({
      difficultyLevels: [],
      learningThemes: [],
      specialties: [{ id: "sp-adult", label: "成人保健" }],
    });
  });

  test("選択肢が渡されなければ全て空配列", () => {
    expect(getTeachingMaterialClassificationOptions({})).toEqual({
      difficultyLevels: [],
      learningThemes: [],
      specialties: [],
    });
  });

  test("選択肢に実在する id だけ返す", () => {
    const options = [{ id: "sp-adult", label: "成人保健" }];
    expect(pickKnownOptionId(options, " sp-adult ")).toBe("sp-adult");
    expect(pickKnownOptionId(options, "sp-unknown")).toBeUndefined();
    expect(pickKnownOptionId(options, undefined)).toBeUndefined();
    expect(pickKnownOptionId([], "sp-adult")).toBeUndefined();
  });
});

describe("buildTeachingMaterialResponse", () => {
  test("modelId 不備は throw せず error JSON を返す", async () => {
    const result = await buildTeachingMaterialResponse(
      { type: "teaching_material", text: "x" },
      { config: makeConfig("") },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("BEDROCK_MODEL_ID");
    }
  });

  test("text 欠落は error を返し、runner を呼ばない", async () => {
    const runner = fakeTeachingMaterialRunner();
    const result = await buildTeachingMaterialResponse(
      { type: "teaching_material" },
      { config: makeConfig(), teachingMaterialRunner: runner.run },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("text");
    }
    expect(runner.messages).toHaveLength(0);
  });

  test("専門職コメント本文を message に含めて runner を呼び、構造化出力を返す", async () => {
    const runner = fakeTeachingMaterialRunner();
    const result = await buildTeachingMaterialResponse(
      {
        type: "teaching_material",
        text: "血圧が高いので食生活を見直すよう指導しました。",
        actor_id: "a1",
        session_id: "s1",
      },
      { config: makeConfig(), teachingMaterialRunner: runner.run },
    );

    expect(result).toEqual({
      status: "success",
      type: "teaching_material",
      title: OUTPUT.title,
      summary: OUTPUT.summary,
      learningObjective: OUTPUT.learningObjective,
      teachingPoints: OUTPUT.teachingPoints,
      specialtyId: undefined,
      learningThemeId: undefined,
      difficultyId: undefined,
      session_id: "s1",
      actor_id: "a1",
      model_id: "test-model",
    });
    expect(runner.messages[0]).toContain(
      "血圧が高いので食生活を見直すよう指導しました。",
    );
  });

  test("分類の選択肢を message に列挙し、実在する id の推奨だけ返す", async () => {
    const runner = fakeTeachingMaterialRunner({
      ...OUTPUT,
      specialtyId: "sp-adult",
      learningThemeId: "th-assessment",
      // マスタに無い id は model の捏造として捨てる。
      difficultyId: "df-unknown",
    });

    const result = await buildTeachingMaterialResponse(
      {
        type: "teaching_material",
        text: "血圧が高いので食生活を見直すよう指導しました。",
        classification_options: CLASSIFICATION_OPTIONS,
      },
      { config: makeConfig(), teachingMaterialRunner: runner.run },
    );

    expect(result).toMatchObject({
      status: "success",
      specialtyId: "sp-adult",
      learningThemeId: "th-assessment",
      difficultyId: undefined,
    });
    expect(runner.messages[0]).toContain("- sp-adult: 成人保健");
    expect(runner.messages[0]).toContain("- th-assessment: アセスメント");
    expect(runner.messages[0]).toContain("- df-basic: 基礎");
  });

  test("分類の選択肢が無ければ message に節を出さず、推奨も返さない", async () => {
    const runner = fakeTeachingMaterialRunner({
      ...OUTPUT,
      specialtyId: "sp-adult",
    });

    const result = await buildTeachingMaterialResponse(
      { type: "teaching_material", text: "x" },
      { config: makeConfig(), teachingMaterialRunner: runner.run },
    );

    expect(result).toMatchObject({ specialtyId: undefined });
    expect(runner.messages[0]).not.toContain("選択肢");
  });

  test("StructuredOutputError は error 応答に変換する", async () => {
    const result = await buildTeachingMaterialResponse(
      { type: "teaching_material", text: "x" },
      {
        config: makeConfig(),
        teachingMaterialRunner: async () => {
          throw new StructuredOutputError("did not converge");
        },
      },
    );

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("did not converge");
    }
  });

  test("StructuredOutputError 以外の例外は re-throw する", async () => {
    await expect(
      buildTeachingMaterialResponse(
        { type: "teaching_material", text: "x" },
        {
          config: makeConfig(),
          teachingMaterialRunner: async () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");
  });
});
