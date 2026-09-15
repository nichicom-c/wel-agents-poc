import { describe, expect, test } from "bun:test";
import { StructuredOutputError } from "@strands-agents/sdk";

import type { TeachingMaterialOutput } from "../contracts/teaching-material.ts";
import {
  getTeachingMaterialSourceText,
  isTeachingMaterialRequest,
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
  learningObjective:
    "不足情報を確認し、S/Oを関連付けてAssessmentできるようになる",
  teachingPoints: ["単回の測定値だけで結論を出さない", "不足情報を明確にする"],
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
      learningObjective: OUTPUT.learningObjective,
      teachingPoints: OUTPUT.teachingPoints,
      session_id: "s1",
      actor_id: "a1",
      model_id: "test-model",
    });
    expect(runner.messages[0]).toContain(
      "血圧が高いので食生活を見直すよう指導しました。",
    );
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
