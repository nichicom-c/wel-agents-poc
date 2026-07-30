import { describe, expect, test } from "bun:test";
import { StructuredOutputError } from "@strands-agents/sdk";

import type { ExerciseFeedbackOutput } from "../contracts/exercise-feedback.ts";
import type { Config } from "../infra/config.ts";
import { buildExerciseFeedbackResponse } from "./build-exercise-feedback-response.ts";

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

const CASE_PAYLOAD = {
  evaluationCriteria: ["S/O が A を支えているか。"],
  initialPresentation: "母親から夜間の授乳がつらいと発言。",
  modelAnswers: [
    { answerType: "soap" as const, content: "S: 夜間の授乳がつらい。" },
  ],
  title: "母子訪問での疲労蓄積アセスメント演習",
};

const ANSWERS_PAYLOAD = {
  additionalConfirmationText: "パートナーの育児参加状況。",
  assessmentText: "疲労蓄積のリスクがある。",
  soapText: "S: 夜間の授乳がつらい。",
  supportPlanText: "育児支援サービスの利用を提案する。",
};

const OUTPUT: ExerciseFeedbackOutput = {
  assessmentNote: "アセスメントは妥当。",
  dataCollectionNote: "追加確認事項は妥当。",
  documentationNote: "曖昧な表現は無い。",
  rationaleNote: "S/O が A を支えている。",
  supportPlanNote: "支援方針は具体的。",
};

/** 渡されたメッセージを記録し固定 output を返す runner。 */
function fakeExerciseFeedbackRunner(output: ExerciseFeedbackOutput = OUTPUT) {
  const messages: string[] = [];
  const run = async (message: string) => {
    messages.push(message);
    return output;
  };
  return { run, messages };
}

describe("buildExerciseFeedbackResponse", () => {
  test("modelId 不備は throw せず error JSON を返す", async () => {
    const result = await buildExerciseFeedbackResponse(
      {
        exercise_answers: ANSWERS_PAYLOAD,
        exercise_case: CASE_PAYLOAD,
        type: "exercise_feedback",
      },
      { config: makeConfig("") },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("BEDROCK_MODEL_ID");
    }
  });

  test("exercise_case 欠落は error を返し、runner を呼ばない", async () => {
    const runner = fakeExerciseFeedbackRunner();
    const result = await buildExerciseFeedbackResponse(
      { exercise_answers: ANSWERS_PAYLOAD, type: "exercise_feedback" },
      { config: makeConfig(), exerciseFeedbackRunner: runner.run },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("exercise_case");
    }
    expect(runner.messages).toHaveLength(0);
  });

  test("exercise_answers 欠落は error を返し、runner を呼ばない", async () => {
    const runner = fakeExerciseFeedbackRunner();
    const result = await buildExerciseFeedbackResponse(
      { exercise_case: CASE_PAYLOAD, type: "exercise_feedback" },
      { config: makeConfig(), exerciseFeedbackRunner: runner.run },
    );
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error).toContain("exercise_answers");
    }
    expect(runner.messages).toHaveLength(0);
  });

  test("ケースと回答を message に含めて runner を呼び、5観点を返す", async () => {
    const runner = fakeExerciseFeedbackRunner();
    const result = await buildExerciseFeedbackResponse(
      {
        actor_id: "a1",
        exercise_answers: ANSWERS_PAYLOAD,
        exercise_case: CASE_PAYLOAD,
        session_id: "s1",
        type: "exercise_feedback",
      },
      { config: makeConfig(), exerciseFeedbackRunner: runner.run },
    );

    expect(result).toEqual({
      status: "success",
      type: "exercise_feedback",
      ...OUTPUT,
      session_id: "s1",
      actor_id: "a1",
      model_id: "test-model",
    });
    expect(runner.messages[0]).toContain(CASE_PAYLOAD.title);
    expect(runner.messages[0]).toContain(ANSWERS_PAYLOAD.soapText);
  });

  test("StructuredOutputError は error 応答に変換する", async () => {
    const result = await buildExerciseFeedbackResponse(
      {
        exercise_answers: ANSWERS_PAYLOAD,
        exercise_case: CASE_PAYLOAD,
        type: "exercise_feedback",
      },
      {
        config: makeConfig(),
        exerciseFeedbackRunner: async () => {
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
      buildExerciseFeedbackResponse(
        {
          exercise_answers: ANSWERS_PAYLOAD,
          exercise_case: CASE_PAYLOAD,
          type: "exercise_feedback",
        },
        {
          config: makeConfig(),
          exerciseFeedbackRunner: async () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow("boom");
  });
});
