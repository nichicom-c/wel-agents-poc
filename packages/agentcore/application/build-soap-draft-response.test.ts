import { describe, expect, test } from "bun:test";
import { StructuredOutputError } from "@strands-agents/sdk";

import type {
  SoapDraftCandidate,
  SoapDraftOutput,
} from "../contracts/soap-draft.ts";
import { getSoapDraftText, isSoapDraftRequest } from "../domain/soap-draft.ts";
import type { Config } from "../infra/config.ts";
import { buildSoapDraftResponse } from "./build-soap-draft-response.ts";

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

const CANDIDATE: SoapDraftCandidate = {
  category: "S",
  draftText: "利用者は最近眠れていないと話した。",
  evidenceQuote: "最近眠れていない",
  reasoning: "本人の発言のため主観的情報とした。",
  confidence: 0.8,
};

const OUTPUT: SoapDraftOutput = {
  candidates: [CANDIDATE],
  recommendedRecordTypes: ["support_activity", "summary"],
};

/** 渡されたメッセージを記録し固定 output を返す runner。 */
function fakeSoapDraftRunner(output: SoapDraftOutput = OUTPUT) {
  const messages: string[] = [];
  const run = async (message: string) => {
    messages.push(message);
    return output;
  };
  return { run, messages };
}

describe("isSoapDraftRequest / getSoapDraftText", () => {
  test("type: soap_draft のときだけ true", () => {
    expect(isSoapDraftRequest({ type: "soap_draft" })).toBe(true);
    expect(isSoapDraftRequest({})).toBe(false);
    expect(isSoapDraftRequest({ type: "chat" })).toBe(false);
  });

  test("有効な text を trim して返す / 無効なら undefined", () => {
    expect(getSoapDraftText({ text: "  hello  " })).toBe("hello");
    expect(getSoapDraftText({})).toBeUndefined();
    expect(getSoapDraftText({ text: "   " })).toBeUndefined();
    expect(getSoapDraftText({ text: 123 })).toBeUndefined();
  });
});

describe("buildSoapDraftResponse", () => {
  test("modelId 不備は throw せず error JSON を返す", async () => {
    const result = await buildSoapDraftResponse(
      { type: "soap_draft", text: "x" },
      { config: makeConfig("") },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("BEDROCK_MODEL_ID");
    }
  });

  test("text 欠落は error を返し、runner を呼ばない", async () => {
    const runner = fakeSoapDraftRunner();
    const result = await buildSoapDraftResponse(
      { type: "soap_draft" },
      { config: makeConfig(), soapDraftRunner: runner.run },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("text");
    }
    expect(runner.messages).toHaveLength(0);
  });

  test("入力テキストを message に含めて runner を呼び、反映候補つきの候補を返す", async () => {
    const runner = fakeSoapDraftRunner();
    const result = await buildSoapDraftResponse(
      {
        type: "soap_draft",
        text: "最近眠れていない",
        actor_id: "a1",
        session_id: "s1",
      },
      { config: makeConfig(), soapDraftRunner: runner.run },
    );

    expect(result).toEqual({
      status: "success",
      type: "soap_draft",
      candidates: [CANDIDATE],
      recommendedRecordTypes: ["support_activity", "summary"],
      session_id: "s1",
      actor_id: "a1",
      model_id: "test-model",
    });
    expect(runner.messages[0]).toContain("最近眠れていない");
  });

  test("StructuredOutputError は error 応答に変換する", async () => {
    const result = await buildSoapDraftResponse(
      { type: "soap_draft", text: "x" },
      {
        config: makeConfig(),
        soapDraftRunner: async () => {
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
      buildSoapDraftResponse(
        { type: "soap_draft", text: "x" },
        {
          config: makeConfig(),
          soapDraftRunner: async () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");
  });
});
