import { describe, expect, test } from "bun:test";

import {
  getMaterialChatContext,
  getMaterialChatHistory,
  getMaterialChatMessage,
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

/** 渡されたメッセージを記録し固定 message を返す runner。 */
function fakeMaterialChatRunner(message = "こんにちは、質問はありますか？") {
  const calls: string[] = [];
  const run = async (built: string) => {
    calls.push(built);
    return message;
  };
  return { calls, run };
}

describe("isMaterialChatRequest / getMaterialChatContext / getMaterialChatHistory / getMaterialChatMessage", () => {
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
    expect(runner.calls).toHaveLength(0);
  });

  test("教材文脈・履歴・今回の発言を message に含めて runner を呼ぶ", async () => {
    const runner = fakeMaterialChatRunner("応答本文");
    const result = await buildMaterialChatResponse(
      {
        actor_id: "a1",
        history: [{ role: "assistant", text: "こんにちは" }],
        material: {
          learningObjective: "学習目標テキスト",
          teachingPoints: ["ポイント1"],
          title: "教材タイトル",
        },
        message: "質問です",
        session_id: "s1",
        type: "material_chat",
      },
      { config: makeConfig(), materialChatRunner: runner.run },
    );

    expect(result).toEqual({
      actor_id: "a1",
      message: "応答本文",
      model_id: "test-model",
      session_id: "s1",
      status: "success",
      type: "material_chat",
    });
    expect(runner.calls[0]).toContain("教材タイトル");
    expect(runner.calls[0]).toContain("学習目標テキスト");
    expect(runner.calls[0]).toContain("ポイント1");
    expect(runner.calls[0]).toContain("こんにちは");
    expect(runner.calls[0]).toContain("質問です");
  });

  test("履歴が無く発言も無い初回ターンは、要点紹介を促す文言になる", async () => {
    const runner = fakeMaterialChatRunner();
    await buildMaterialChatResponse(
      { material: { title: "教材タイトル" }, type: "material_chat" },
      { config: makeConfig(), materialChatRunner: runner.run },
    );

    expect(runner.calls[0]).toContain("最初のターン");
  });
});
