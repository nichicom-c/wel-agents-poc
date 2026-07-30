/**
 * Training 画面（issue #9）の「提出する」が呼ぶ組み立てロジック。
 *
 * chat（supervisor）とは独立した単発の生成パスなので、KB id 等を要求する共有の
 * `missingConfig()` は使わず、この機能が実際に必要とする `modelId` だけを確認する。
 * Memory も使わない（stateless な一回限りの生成のため）。
 */

import { StructuredOutputError } from "@strands-agents/sdk";

import type {
  ExerciseFeedbackAnswers,
  ExerciseFeedbackCaseContext,
  ExerciseFeedbackOutput,
} from "../contracts/exercise-feedback.ts";
import type { RuntimeRequest, RuntimeResponse } from "../contracts/runtime.ts";
import {
  getExerciseFeedbackAnswers,
  getExerciseFeedbackCaseContext,
} from "../domain/exercise-feedback.ts";
import { getActorId, getSessionId } from "../domain/session.ts";
import { type Config, configFromEnv } from "../infra/config.ts";
import type { AgentDeps } from "./agent-deps.ts";
import { buildExerciseFeedbackAgent } from "./exercise-feedback-agent.ts";

/** 演習フィードバック agent を実行して5観点を返す seam（テストで fake を注入）。 */
export type ExerciseFeedbackRunner = (
  message: string,
) => Promise<ExerciseFeedbackOutput>;

export type ExerciseFeedbackDeps = {
  /** 実行設定（省略時は環境変数から解決）。 */
  config?: Config;
  /** 演習フィードバック agent 実行（省略時は config から本物の agent を生成）。 */
  exerciseFeedbackRunner?: ExerciseFeedbackRunner;
};

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** config から本物の演習フィードバック agent を生成し、構造化出力をそのまま返す runner。 */
function defaultExerciseFeedbackRunner(config: Config): ExerciseFeedbackRunner {
  const deps: AgentDeps = { config };
  const agent = buildExerciseFeedbackAgent(deps);
  return async (message) => {
    const result = await agent.invoke(message);
    // AgentResult.structuredOutput は SDK 側で z.output<z.ZodType> としか型付けされておらず
    // （soap-draft-agent.ts と同じ理由）、SDK が呼び出し時に同じ schema で validate 済みなので
    // ここで cast する。
    const structuredOutput = result.structuredOutput as
      | ExerciseFeedbackOutput
      | undefined;
    if (!structuredOutput) {
      throw new StructuredOutputError(
        "exercise feedback agent returned no output",
      );
    }
    return structuredOutput;
  };
}

function buildMessage(
  caseContext: ExerciseFeedbackCaseContext,
  answers: ExerciseFeedbackAnswers,
): string {
  const lines: string[] = [
    `演習ケース: ${caseContext.title}`,
    `初期提示情報: ${caseContext.initialPresentation}`,
  ];
  if (caseContext.expectedWorkScene) {
    lines.push(`想定業務場面: ${caseContext.expectedWorkScene}`);
  }
  if (caseContext.constraintsText) {
    lines.push(`制約条件: ${caseContext.constraintsText}`);
  }
  if (caseContext.requiredInstitutionalKnowledge) {
    lines.push(`必要な制度知識: ${caseContext.requiredInstitutionalKnowledge}`);
  }
  if (caseContext.evaluationCriteria.length > 0) {
    lines.push("評価観点:");
    for (const criterion of caseContext.evaluationCriteria) {
      lines.push(`- ${criterion}`);
    }
  }
  if (caseContext.modelAnswers.length > 0) {
    lines.push("模範回答（単一正解ではなく複数の妥当な判断パターン）:");
    for (const answer of caseContext.modelAnswers) {
      const note = answer.acceptableNote ? `（${answer.acceptableNote}）` : "";
      lines.push(`- [${answer.answerType}] ${answer.content}${note}`);
    }
  }
  lines.push("");
  lines.push("受講者の提出物:");
  lines.push(`SOAP（情報収集）: ${answers.soapText}`);
  lines.push(
    `追加確認事項: ${answers.additionalConfirmationText || "（無し）"}`,
  );
  lines.push(`アセスメント: ${answers.assessmentText}`);
  lines.push(`支援方針: ${answers.supportPlanText}`);
  return lines.join("\n");
}

/**
 * リクエストを処理し、返す JSON 相当の値を組み立てる。
 *
 * 流れ: modelId の確認 → exercise_case/exercise_answers 必須チェック → メッセージ組み立て →
 * 演習フィードバック agent 実行（StructuredOutputError は error 応答に変換）→ 応答整形。
 */
export async function buildExerciseFeedbackResponse(
  payload: RuntimeRequest,
  deps: ExerciseFeedbackDeps = {},
): Promise<RuntimeResponse> {
  const config = deps.config ?? configFromEnv();
  if (!config.modelId) {
    return {
      status: "error",
      error: "Missing required configuration: BEDROCK_MODEL_ID",
    };
  }

  const caseContext = getExerciseFeedbackCaseContext(payload);
  if (caseContext === undefined) {
    return { status: "error", error: "Missing required field: exercise_case" };
  }

  const answers = getExerciseFeedbackAnswers(payload);
  if (answers === undefined) {
    return {
      status: "error",
      error: "Missing required field: exercise_answers",
    };
  }

  const actorId = getActorId(payload);
  const sessionId = getSessionId(payload);
  const message = buildMessage(caseContext, answers);

  const runExerciseFeedback =
    deps.exerciseFeedbackRunner ?? defaultExerciseFeedbackRunner(config);

  let output: ExerciseFeedbackOutput;
  try {
    output = await runExerciseFeedback(message);
  } catch (error) {
    if (error instanceof StructuredOutputError) {
      return {
        status: "error",
        error: `Exercise feedback generation did not converge to a valid structure: ${stringifyError(error)}`,
      };
    }
    throw error;
  }

  return {
    status: "success",
    type: "exercise_feedback",
    dataCollectionNote: output.dataCollectionNote,
    rationaleNote: output.rationaleNote,
    assessmentNote: output.assessmentNote,
    supportPlanNote: output.supportPlanNote,
    documentationNote: output.documentationNote,
    session_id: sessionId,
    actor_id: actorId,
    model_id: config.modelId,
  };
}
