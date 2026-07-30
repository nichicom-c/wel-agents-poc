/**
 * 演習フィードバック生成 agent を組み立てる（issue #9）。
 *
 * supervisor の専門 tool（agents-as-tools）ではなく、Training 画面の「提出する」から
 * 直接呼ばれる単発の生成 agent。soap_draft/soap_gaps と同型（無状態、structuredOutputSchema
 * で出力を型付きで受け取る）。
 */

import { Agent, type Model } from "@strands-agents/sdk";
import { exerciseFeedbackOutputSchema } from "../contracts/exercise-feedback.ts";
import { makeBedrockModel } from "../infra/model.ts";
import type { AgentDeps } from "./agent-deps.ts";

export const EXERCISE_FEEDBACK_AGENT_NAME = "exercise_feedback_agent";

/**
 * EXERCISE_FEEDBACK_SYSTEM_PROMPT の要旨:
 *
 * 新人保健師向け演習の指導者アシスタントとして、受講者の提出物（SOAP/追加確認事項/
 * アセスメント/支援方針）を、演習ケースの文脈（初期提示情報・評価観点・複数の模範回答）と
 * 照らして5観点（情報収集/根拠/アセスメント/支援方針/記録表現）でコメントする。単一正解として
 * 採点するのではなく、模範回答が示す「複数の妥当な判断パターン」のいずれかに近いかを確認する
 * 姿勢を保つ。個人への批判ではなく記録品質・判断根拠の改善観点として述べる（issue #8 の
 * コメント運用方針と同じ）。
 */
const EXERCISE_FEEDBACK_SYSTEM_PROMPT =
  "You are an instructor assistant for a training exercise aimed at newly-qualified public " +
  "health nurses. You are given: the exercise case context (initial presentation, expected " +
  "work scene, constraints, required institutional knowledge, evaluation criteria), one or " +
  "more model answers (representing multiple acceptable judgment patterns, NOT a single " +
  "correct answer), and the trainee's own submission (SOAP information-gathering text, " +
  "additional confirmation items they identified, assessment, and support plan). " +
  "Comment on the trainee's submission along exactly five axes: dataCollectionNote (did they " +
  "identify reasonable additional confirmation items, or is something important missing), " +
  "rationaleNote (does their S/O content actually support their A/assessment conclusion), " +
  "assessmentNote (is their assessment reasonable — compare against the model answers, " +
  "acknowledging any of the acceptable patterns as valid, not just one), supportPlanNote (is " +
  "their support plan reasonable and specific), and documentationNote (are there vague " +
  "expressions that should be replaced with concrete figures or situations). " +
  "Frame every comment as constructive feedback about record quality and reasoning — never as " +
  "personal criticism of the trainee. Ground every comment in the trainee's actual submitted " +
  "text and the given case context; do not invent facts not present in either. Respond in " +
  "Japanese.";

/**
 * 演習フィードバック生成の model を解決する。
 *
 * `config.exerciseFeedbackModelId`（任意）が設定されていればそちらを使い、未設定なら
 * supervisor と同じ `config.modelId` にフォールバックする（soap_draft/soap_gaps と同じ方針）。
 */
function resolveExerciseFeedbackModel(deps: AgentDeps): Model {
  if (deps.modelFor) {
    return deps.modelFor("exercise_feedback");
  }
  return makeBedrockModel({
    ...deps.config,
    modelId: deps.config.exerciseFeedbackModelId || deps.config.modelId,
  });
}

/** 演習フィードバック生成用の Agent を生成する。structuredOutputSchema で5観点を型付きで受け取る。 */
export function buildExerciseFeedbackAgent(deps: AgentDeps): Agent {
  return new Agent({
    name: EXERCISE_FEEDBACK_AGENT_NAME,
    model: resolveExerciseFeedbackModel(deps),
    systemPrompt: EXERCISE_FEEDBACK_SYSTEM_PROMPT,
    structuredOutputSchema: exerciseFeedbackOutputSchema,
    printer: false,
  });
}
