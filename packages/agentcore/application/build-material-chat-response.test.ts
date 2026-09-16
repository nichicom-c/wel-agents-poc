import { describe, expect, test } from "bun:test";
import { StructuredOutputError } from "@strands-agents/sdk";

import type { MaterialChatOutput } from "../contracts/material-chat.ts";
import {
  getMaterialChatContext,
  getMaterialChatHistory,
  getMaterialChatMessage,
  getMaterialChatTeachingPoint,
  isMaterialChatRequest,
} from "../domain/material-chat.ts";
import type { Config } from "../infra/config.ts";
import { buildMaterialChatResponse } from "./build-material-chat-response.ts";

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

const OUTPUT: MaterialChatOutput = {
  message: "こんにちは、質問はありますか？",
  resolved: false,
  suggestions: ["視点1"],
};

/** 渡されたメッセージを記録し固定 output を返す runner。 */
function fakeMaterialChatRunner(output: MaterialChatOutput = OUTPUT) {
  const messages: string[] = [];
  const run = async (message: string) => {
    messages.push(message);
    return output;
  };
  return { messages, run };
}

describe("isMaterialChatRequest / getMaterialChatContext / getMaterialChatHistory / getMaterialChatMessage / getMaterialChatTeachingPoint", () => {
  test("type: material_chat のときだけ true", () => {
    expect(isMaterialChatRequest({ type: "material_chat" })).toBe(true);
    expect(isMaterialChatRequest({})).toBe(false);
  });

  test("material.title が無ければ undefined、あれば学習目標/指導ポイントも取り出す", () => {
    expect(getMaterialChatContext({})).toBeUndefined();
    expect(
      getMaterialChatContext({ material: { title: "  " } }),
    ).toBeUndefined();
    expect(
      getMaterialChatContext({
        material: {
          learningObjective: "学習目標",
          teachingPoints: ["p1", " ", "p2"],
          title: " タイトル ",
        },
      }),
    ).toEqual({
      learningObjective: "学習目標",
      teachingPoints: ["p1", "p2"],
      title: "タイトル",
    });
  });

  test("history は role/text が揃った要素だけを残す", () => {
    expect(
      getMaterialChatHistory({
        history: [
          { role: "user", text: "質問" },
          { role: "assistant", text: "" },
          { role: "other", text: "x" },
          "not an object",
        ],
      }),
    ).toEqual([{ role: "user", text: "質問" }]);
    expect(getMaterialChatHistory({})).toEqual([]);
  });

  test("message は trim して返し、空/欠落は undefined", () => {
    expect(getMaterialChatMessage({ message: "  こんにちは  " })).toBe(
      "こんにちは",
    );
    expect(getMaterialChatMessage({})).toBeUndefined();
    expect(getMaterialChatMessage({ message: "   " })).toBeUndefined();
  });

  test("teaching_point は trim して返し、空/欠落は undefined", () => {
    expect(
      getMaterialChatTeachingPoint({ teaching_point: "  ポイント  " }),
    ).toBe("ポイント");
    expect(getMaterialChatTeachingPoint({})).toBeUndefined();
    expect(
      getMaterialChatTeachingPoint({ teaching_point: "   " }),
    ).toBeUndefined();
  });
});

describe("buildMaterialChatResponse", () => {
  test("modelId 不備は throw せず error JSON を返す", async () => {
    const result = await buildMaterialChatResponse(
      { material: { title: "教材A" }, type: "material_chat" },
      { config: makeConfig("") },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("BEDROCK_MODEL_ID");
    }
  });

  test("material 欠落は error を返し、runner を呼ばない", async () => {
    const runner = fakeMaterialChatRunner();
    const result = await buildMaterialChatResponse(
      { type: "material_chat" },
      { config: makeConfig(), materialChatRunner: runner.run },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("material");
    }
    expect(runner.messages).toHaveLength(0);
  });

  test("教材文脈・今回の指導のポイント・履歴・今回の発言を message に含めて runner を呼ぶ", async () => {
    const runner = fakeMaterialChatRunner({
      message: "応答本文",
      resolved: true,
      suggestions: [],
    });
    const result = await buildMaterialChatResponse(
      {
        actor_id: "a1",
        history: [{ role: "assistant", text: "こんにちは" }],
        material: {
          learningObjective: "学習目標テキスト",
          teachingPoints: ["ポイント1", "ポイント2"],
          title: "教材タイトル",
        },
        message: "質問です",
        session_id: "s1",
        teaching_point: "ポイント1",
        type: "material_chat",
      },
      { config: makeConfig(), materialChatRunner: runner.run },
    );

    expect(result).toEqual({
      actor_id: "a1",
      message: "応答本文",
      model_id: "test-model",
      resolved: true,
      session_id: "s1",
      status: "success",
      suggestions: [],
      type: "material_chat",
    });
    expect(runner.messages[0]).toContain("教材タイトル");
    expect(runner.messages[0]).toContain("学習目標テキスト");
    expect(runner.messages[0]).toContain(
      "今回扱う指導のポイント（これだけを深掘りする）: ポイント1",
    );
    expect(runner.messages[0]).toContain("こんにちは");
    expect(runner.messages[0]).toContain("質問です");
    // 他の指導のポイント（ポイント2）は意図的に渡さない（全体の要約に流れるのを防ぐため）。
    expect(runner.messages[0]).not.toContain("ポイント2");
  });

  test("teaching_point が無い初回ターンは、教材全体の自由対話を促す文言になる", async () => {
    const runner = fakeMaterialChatRunner();
    await buildMaterialChatResponse(
      { material: { title: "教材タイトル" }, type: "material_chat" },
      { config: makeConfig(), materialChatRunner: runner.run },
    );

    expect(runner.messages[0]).toContain("指定はありません");
    expect(runner.messages[0]).toContain("最初のターンです");
  });

  test("teaching_point がある初回ターンは、問いかけとして提示する指示になる", async () => {
    const runner = fakeMaterialChatRunner();
    await buildMaterialChatResponse(
      {
        material: { teachingPoints: ["ポイント1"], title: "教材タイトル" },
        teaching_point: "ポイント1",
        type: "material_chat",
      },
      { config: makeConfig(), materialChatRunner: runner.run },
    );

    expect(runner.messages[0]).toContain("最初のターンです");
    expect(runner.messages[0]).toContain("問いかけとして提示");
  });

  test("StructuredOutputError は error 応答に変換する", async () => {
    const result = await buildMaterialChatResponse(
      { material: { title: "教材A" }, type: "material_chat" },
      {
        config: makeConfig(),
        materialChatRunner: async () => {
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
      buildMaterialChatResponse(
        { material: { title: "教材A" }, type: "material_chat" },
        {
          config: makeConfig(),
          materialChatRunner: async () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");
  });
});
