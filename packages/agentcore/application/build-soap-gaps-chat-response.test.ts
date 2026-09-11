import { describe, expect, test } from "bun:test";
import { StructuredOutputError } from "@strands-agents/sdk";

import type { SoapDraftCandidate } from "../contracts/soap-draft.ts";
import type { Gap } from "../contracts/soap-gaps.ts";
import type { SoapGapsChatOutput } from "../contracts/soap-gaps-chat.ts";
import type { Config } from "../infra/config.ts";
import type { MemoryStore } from "../infra/memory.ts";
import { buildSoapGapsChatResponse } from "./build-soap-gaps-chat-response.ts";

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

const CANDIDATES: SoapDraftCandidate[] = [
  {
    category: "A",
    draftText: "転倒リスクが高い。",
    evidenceQuote: "転倒リスクが高い",
    reasoning: "観察結果からの評価。",
    confidence: 0.8,
  },
];

const GAP: Gap = {
  gapType: "insufficient_reasoning",
  soapCategory: "A",
  targetItem: "転倒リスクが高い。",
  detail: "アセスメントの根拠が不足しています。",
  relatedEvidenceQuotes: ["転倒リスクが高い"],
  skippable: false,
};

class FakeMemory implements MemoryStore {
  readonly saved: [string, string, string, string][] = [];
  constructor(private readonly history = "") {}
  async recentHistory(): Promise<string> {
    return this.history;
  }
  async saveTurn(
    actorId: string,
    sessionId: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    this.saved.push([actorId, sessionId, userText, assistantText]);
  }
}

function fakeSoapGapsChatRunner(output: SoapGapsChatOutput) {
  const messages: string[] = [];
  const run = async (message: string) => {
    messages.push(message);
    return output;
  };
  return { run, messages };
}

describe("buildSoapGapsChatResponse", () => {
  test("modelId 不備は throw せず error JSON を返す", async () => {
    const runner = fakeSoapGapsChatRunner({
      message: "x",
      suggestions: [],
      resolved: false,
    });
    const result = await buildSoapGapsChatResponse(
      { type: "soap_gaps_chat", candidates: CANDIDATES, gap: GAP },
      { config: makeConfig(""), soapGapsChatRunner: runner.run, memory: null },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("BEDROCK_MODEL_ID");
    }
    expect(runner.messages).toHaveLength(0);
  });

  test("gap 欠落は error を返す", async () => {
    const runner = fakeSoapGapsChatRunner({
      message: "x",
      suggestions: [],
      resolved: false,
    });
    const result = await buildSoapGapsChatResponse(
      { type: "soap_gaps_chat", candidates: CANDIDATES },
      { config: makeConfig(), soapGapsChatRunner: runner.run, memory: null },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("gap");
    }
  });

  test("candidates 欠落は error を返す", async () => {
    const runner = fakeSoapGapsChatRunner({
      message: "x",
      suggestions: [],
      resolved: false,
    });
    const result = await buildSoapGapsChatResponse(
      { type: "soap_gaps_chat", gap: GAP },
      { config: makeConfig(), soapGapsChatRunner: runner.run, memory: null },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("candidates");
    }
  });

  test("初回ターン（message なし）は提示用のプロンプトを組み立てて実行する", async () => {
    const runner = fakeSoapGapsChatRunner({
      message: "転倒リスクの根拠となる具体的な様子はありましたか？",
      suggestions: ["ふらつきが見られた", "杖を使い始めた"],
      resolved: false,
    });
    const result = await buildSoapGapsChatResponse(
      {
        type: "soap_gaps_chat",
        candidates: CANDIDATES,
        gap: GAP,
        actor_id: "a1",
        session_id: "s1",
      },
      { config: makeConfig(), soapGapsChatRunner: runner.run, memory: null },
    );

    expect(result).toEqual({
      status: "success",
      type: "soap_gaps_chat",
      message: "転倒リスクの根拠となる具体的な様子はありましたか？",
      suggestions: ["ふらつきが見られた", "杖を使い始めた"],
      resolved: false,
      candidateText: undefined,
      session_id: "s1",
      actor_id: "a1",
      model_id: "test-model",
    });
    expect(runner.messages[0]).toContain("insufficient_reasoning");
    expect(runner.messages[0]).toContain("まだ利用者の発言はありません");
  });

  test("message ありのターンは利用者の発言を含めて実行し、resolved/candidateText を返す", async () => {
    const runner = fakeSoapGapsChatRunner({
      message: "ありがとうございます。反映しますね。",
      suggestions: [],
      resolved: true,
      candidateText: "訪問時にふらつきが見られた。",
    });
    const result = await buildSoapGapsChatResponse(
      {
        type: "soap_gaps_chat",
        candidates: CANDIDATES,
        gap: GAP,
        message: "訪問時にふらついていました",
      },
      { config: makeConfig(), soapGapsChatRunner: runner.run, memory: null },
    );

    expect(result.status).toBe("success");
    if (result.status === "success" && "type" in result) {
      expect(result.type).toBe("soap_gaps_chat");
      if (result.type === "soap_gaps_chat") {
        expect(result.resolved).toBe(true);
        expect(result.candidateText).toBe("訪問時にふらつきが見られた。");
      }
    }
    expect(runner.messages[0]).toContain("訪問時にふらついていました");
  });

  test("Memory から履歴を取得して前置きし、今回ターンを保存する", async () => {
    const memory = new FakeMemory("User: prev\nAssistant: ok");
    const runner = fakeSoapGapsChatRunner({
      message: "了解しました。",
      suggestions: [],
      resolved: false,
    });
    await buildSoapGapsChatResponse(
      {
        type: "soap_gaps_chat",
        candidates: CANDIDATES,
        gap: GAP,
        message: "こうです",
        actor_id: "a1",
        session_id: "s1",
      },
      { config: makeConfig(), soapGapsChatRunner: runner.run, memory },
    );

    expect(runner.messages[0]).toContain("Previous conversation");
    expect(runner.messages[0]).toContain("User: prev");
    expect(memory.saved).toEqual([["a1", "s1", "こうです", "了解しました。"]]);
  });

  test("StructuredOutputError は error 応答に変換する", async () => {
    const result = await buildSoapGapsChatResponse(
      { type: "soap_gaps_chat", candidates: CANDIDATES, gap: GAP },
      {
        config: makeConfig(),
        memory: null,
        soapGapsChatRunner: async () => {
          throw new StructuredOutputError("did not converge");
        },
      },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("did not converge to a valid structure");
    }
  });

  test("StructuredOutputError 以外の例外は re-throw する", async () => {
    await expect(
      buildSoapGapsChatResponse(
        { type: "soap_gaps_chat", candidates: CANDIDATES, gap: GAP },
        {
          config: makeConfig(),
          memory: null,
          soapGapsChatRunner: async () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");
  });
});
