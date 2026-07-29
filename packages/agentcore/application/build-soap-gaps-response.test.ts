import { describe, expect, test } from "bun:test";
import { StructuredOutputError } from "@strands-agents/sdk";

import type { SoapDraftCandidate } from "../contracts/soap-draft.ts";
import type {
  AiGapDetectionOutput,
  AiGapQuestionList,
} from "../contracts/soap-gaps.ts";
import {
  getSoapGapsCandidates,
  isSoapGapsRequest,
} from "../domain/soap-gaps.ts";
import type { Config } from "../infra/config.ts";
import { buildSoapGapsResponse } from "./build-soap-gaps-response.ts";

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

/** A のみ（S/O 無し）で根拠不足が1件検出される候補セット。 */
const CANDIDATES_WITH_GAP: SoapDraftCandidate[] = [
  {
    category: "A",
    draftText: "転倒リスクが高い。",
    evidenceQuote: "転倒リスクが高い",
    reasoning: "観察結果からの評価。",
    confidence: 0.8,
  },
];

/** S/O/A/P すべて揃い、曖昧語や矛盾も無く、不足が0件になる候補セット。 */
const CANDIDATES_WITHOUT_GAP: SoapDraftCandidate[] = [
  {
    category: "S",
    draftText: "最近眠れていないと話した。",
    evidenceQuote: "最近眠れていない",
    reasoning: "本人の発言。",
    confidence: 0.9,
  },
  {
    category: "O",
    draftText: "体温は36.5度だった。",
    evidenceQuote: "体温は36.5度",
    reasoning: "測定値。",
    confidence: 0.9,
  },
  {
    category: "A",
    draftText: "睡眠状況の悪化がうかがえる。",
    evidenceQuote: "最近眠れていない",
    reasoning: "S/O から評価。",
    confidence: 0.9,
  },
];

function fakeSoapGapsDetectionRunner(
  output: AiGapDetectionOutput = { gaps: [] },
) {
  const messages: string[] = [];
  const run = async (message: string) => {
    messages.push(message);
    return output;
  };
  return { run, messages };
}

function fakeSoapGapsRunner(output: AiGapQuestionList) {
  const messages: string[] = [];
  const run = async (message: string) => {
    messages.push(message);
    return output;
  };
  return { run, messages };
}

describe("isSoapGapsRequest / getSoapGapsCandidates", () => {
  test("type: soap_gaps のときだけ true", () => {
    expect(isSoapGapsRequest({ type: "soap_gaps" })).toBe(true);
    expect(isSoapGapsRequest({})).toBe(false);
  });

  test("有効な candidates を返す / 無効なら undefined", () => {
    expect(getSoapGapsCandidates({ candidates: CANDIDATES_WITH_GAP })).toEqual(
      CANDIDATES_WITH_GAP,
    );
    expect(getSoapGapsCandidates({})).toBeUndefined();
  });
});

describe("buildSoapGapsResponse", () => {
  test("modelId 不備は throw せず error JSON を返す", async () => {
    const detection = fakeSoapGapsDetectionRunner();
    const questions = fakeSoapGapsRunner({ questions: [] });
    const result = await buildSoapGapsResponse(
      { type: "soap_gaps", candidates: CANDIDATES_WITH_GAP },
      {
        config: makeConfig(""),
        soapGapsDetectionRunner: detection.run,
        soapGapsRunner: questions.run,
      },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("BEDROCK_MODEL_ID");
    }
    expect(detection.messages).toHaveLength(0);
  });

  test("candidates 欠落は error を返す", async () => {
    const detection = fakeSoapGapsDetectionRunner();
    const questions = fakeSoapGapsRunner({ questions: [] });
    const result = await buildSoapGapsResponse(
      { type: "soap_gaps" },
      {
        config: makeConfig(),
        soapGapsDetectionRunner: detection.run,
        soapGapsRunner: questions.run,
      },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("candidates");
    }
    expect(detection.messages).toHaveLength(0);
    expect(questions.messages).toHaveLength(0);
  });

  test("不足が無ければ質問生成 AI を呼ばず gaps/questions とも空配列で返す", async () => {
    const detection = fakeSoapGapsDetectionRunner();
    const questions = fakeSoapGapsRunner({ questions: [] });
    const result = await buildSoapGapsResponse(
      {
        type: "soap_gaps",
        candidates: CANDIDATES_WITHOUT_GAP,
        actor_id: "a1",
        session_id: "s1",
      },
      {
        config: makeConfig(),
        soapGapsDetectionRunner: detection.run,
        soapGapsRunner: questions.run,
      },
    );

    expect(result).toEqual({
      status: "success",
      type: "soap_gaps",
      gaps: [],
      questions: [],
      session_id: "s1",
      actor_id: "a1",
      model_id: "test-model",
    });
    expect(detection.messages).toHaveLength(1);
    expect(questions.messages).toHaveLength(0);
  });

  test("ルールベースで検出した不足を AI が返した質問とマッチさせて反映する", async () => {
    const detection = fakeSoapGapsDetectionRunner();
    const questions = fakeSoapGapsRunner({
      questions: [
        {
          gapType: "insufficient_reasoning",
          soapCategory: "A",
          targetItem: "転倒リスクが高い。",
          questionText: "転倒リスクの根拠となる具体的な様子はありましたか？",
        },
      ],
    });
    const result = await buildSoapGapsResponse(
      {
        type: "soap_gaps",
        candidates: CANDIDATES_WITH_GAP,
        actor_id: "a1",
        session_id: "s1",
      },
      {
        config: makeConfig(),
        soapGapsDetectionRunner: detection.run,
        soapGapsRunner: questions.run,
      },
    );

    expect(result.status).toBe("success");
    if (
      result.status === "success" &&
      "type" in result &&
      result.type === "soap_gaps"
    ) {
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]?.gapType).toBe("insufficient_reasoning");
      expect(result.questions).toEqual([
        {
          gapType: "insufficient_reasoning",
          soapCategory: "A",
          targetItem: "転倒リスクが高い。",
          questionText: "転倒リスクの根拠となる具体的な様子はありましたか？",
          skippable: false,
        },
      ]);
    }
    expect(questions.messages[0]).toContain("insufficient_reasoning");
  });

  test("AI が検出した意味的な不足をルールベースの結果に統合する", async () => {
    const detection = fakeSoapGapsDetectionRunner({
      gaps: [
        {
          gapType: "contradictory",
          soapCategory: "S",
          targetItem: "食欲はある。",
          detail: "「食欲はある」と「何も食べていない」が矛盾しています。",
          relatedEvidenceQuotes: ["食欲はある", "何も食べていない"],
        },
      ],
    });
    const questions = fakeSoapGapsRunner({
      questions: [
        {
          gapType: "insufficient_reasoning",
          soapCategory: "A",
          targetItem: "転倒リスクが高い。",
          questionText: "転倒リスクの根拠となる具体的な様子はありましたか？",
        },
        {
          gapType: "contradictory",
          soapCategory: "S",
          targetItem: "食欲はある。",
          questionText: "食事量が少ない理由を教えてください。",
        },
      ],
    });
    const result = await buildSoapGapsResponse(
      { type: "soap_gaps", candidates: CANDIDATES_WITH_GAP },
      {
        config: makeConfig(),
        soapGapsDetectionRunner: detection.run,
        soapGapsRunner: questions.run,
      },
    );

    expect(result.status).toBe("success");
    if (
      result.status === "success" &&
      "type" in result &&
      result.type === "soap_gaps"
    ) {
      expect(new Set(result.gaps.map((g) => g.gapType))).toEqual(
        new Set(["contradictory", "insufficient_reasoning"]),
      );
      expect(result.questions).toHaveLength(2);
    }
    expect(detection.messages[0]).toContain("転倒リスクが高い");
  });

  test("同じ (gapType, soapCategory, targetItem) の AI 検出は重複として落とす", async () => {
    const detection = fakeSoapGapsDetectionRunner({
      gaps: [
        {
          gapType: "insufficient_reasoning",
          soapCategory: "A",
          targetItem: "転倒リスクが高い。",
          detail: "AI が別の言い回しで検出した同じ不足。",
          relatedEvidenceQuotes: ["転倒リスクが高い"],
        },
      ],
    });
    const questions = fakeSoapGapsRunner({ questions: [] });
    const result = await buildSoapGapsResponse(
      { type: "soap_gaps", candidates: CANDIDATES_WITH_GAP },
      {
        config: makeConfig(),
        soapGapsDetectionRunner: detection.run,
        soapGapsRunner: questions.run,
      },
    );

    expect(result.status).toBe("success");
    if (
      result.status === "success" &&
      "type" in result &&
      result.type === "soap_gaps"
    ) {
      expect(result.gaps).toHaveLength(1);
    }
  });

  test("不足検出 AI の StructuredOutputError はルールベースの結果のみで続行する", async () => {
    const questions = fakeSoapGapsRunner({ questions: [] });
    const result = await buildSoapGapsResponse(
      { type: "soap_gaps", candidates: CANDIDATES_WITH_GAP },
      {
        config: makeConfig(),
        soapGapsDetectionRunner: async () => {
          throw new StructuredOutputError("did not converge");
        },
        soapGapsRunner: questions.run,
      },
    );

    expect(result.status).toBe("success");
    if (
      result.status === "success" &&
      "type" in result &&
      result.type === "soap_gaps"
    ) {
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0]?.gapType).toBe("insufficient_reasoning");
    }
  });

  test("不足検出 AI の StructuredOutputError 以外の例外は re-throw する", async () => {
    await expect(
      buildSoapGapsResponse(
        { type: "soap_gaps", candidates: CANDIDATES_WITH_GAP },
        {
          config: makeConfig(),
          soapGapsDetectionRunner: async () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");
  });

  test("AI がマッチしない質問を返した不足には fallback 質問文を使う", async () => {
    const detection = fakeSoapGapsDetectionRunner();
    const questions = fakeSoapGapsRunner({
      questions: [
        {
          gapType: "ambiguous",
          soapCategory: "S",
          targetItem: "別の項目",
          questionText: "無関係な質問",
        },
      ],
    });
    const result = await buildSoapGapsResponse(
      { type: "soap_gaps", candidates: CANDIDATES_WITH_GAP },
      {
        config: makeConfig(),
        soapGapsDetectionRunner: detection.run,
        soapGapsRunner: questions.run,
      },
    );

    expect(result.status).toBe("success");
    if (
      result.status === "success" &&
      "type" in result &&
      result.type === "soap_gaps"
    ) {
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]?.questionText).toContain(
        "判断根拠が不足しています",
      );
    }
  });

  test("質問生成 AI の StructuredOutputError は fallback 質問文に変換し、不足一覧は必ず返す", async () => {
    const detection = fakeSoapGapsDetectionRunner();
    const result = await buildSoapGapsResponse(
      { type: "soap_gaps", candidates: CANDIDATES_WITH_GAP },
      {
        config: makeConfig(),
        soapGapsDetectionRunner: detection.run,
        soapGapsRunner: async () => {
          throw new StructuredOutputError("did not converge");
        },
      },
    );

    expect(result.status).toBe("success");
    if (
      result.status === "success" &&
      "type" in result &&
      result.type === "soap_gaps"
    ) {
      expect(result.gaps).toHaveLength(1);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]?.questionText).toContain(
        "判断根拠が不足しています",
      );
    }
  });

  test("質問生成 AI の StructuredOutputError 以外の例外は re-throw する", async () => {
    const detection = fakeSoapGapsDetectionRunner();
    await expect(
      buildSoapGapsResponse(
        { type: "soap_gaps", candidates: CANDIDATES_WITH_GAP },
        {
          config: makeConfig(),
          soapGapsDetectionRunner: detection.run,
          soapGapsRunner: async () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");
  });
});
