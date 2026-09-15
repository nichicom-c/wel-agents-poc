/**
 * 教材候補生成 agent を組み立てる。
 *
 * supervisor の専門 tool（agents-as-tools）ではなく、Knowledge Review 画面の「コメントを投稿」
 * から直接呼ばれる単発の生成 agent。soap_draft/soap_gaps と同型（無状態、structuredOutputSchema
 * で出力を型付きで受け取る）。
 */

import { Agent, type Model } from "@strands-agents/sdk";
import { teachingMaterialOutputSchema } from "../contracts/teaching-material.ts";
import { makeBedrockModel } from "../infra/model.ts";
import type { AgentDeps } from "./agent-deps.ts";

export const TEACHING_MATERIAL_AGENT_NAME = "teaching_material_agent";

/**
 * TEACHING_MATERIAL_SYSTEM_PROMPT の要旨:
 *
 * 新人保健師の指導を担当する専門職が SOAP 記録に対して書いたレビューコメント（良い点・
 * 改善点・思考経路を含む自由記述）を、他の新人にも展開できる教材候補に変換する。単に
 * コメントを要約するのではなく、コメントの中で示されている「まだ確認していない情報」
 * （家庭血圧・既往歴・服薬状況・生活背景等）や「生活背景とアセスメントの関連付け」
 * 「一方的な指導ではなく本人が実行可能な計画を考える」といった指導観点を、指導可能な
 * 粒度の teachingPoints に分解する。コメントに書かれていない事実は創作しない。
 */
const TEACHING_MATERIAL_SYSTEM_PROMPT =
  "You are an instructional designer supporting the training of newly-qualified public health " +
  "nurses. You are given a professional reviewer's free-text comment about a trainee's SOAP " +
  "record (their subjective/objective findings, assessment, and support plan) — the comment " +
  "may point out good points, missing information the trainee should have checked, an " +
  "assessment made too hastily from a single data point, a failure to connect the client's " +
  "life context (work, diet, sleep, alcohol use, etc.) to the assessment, or one-sided " +
  "instruction instead of a plan the client can actually follow. " +
  "Turn this single review comment into a reusable teaching material candidate that other " +
  "trainees could learn from, with exactly three fields: " +
  "title — a short, specific heading naming the clinical/teaching scenario (not a generic " +
  "label like 'SOAP review'); " +
  "learningObjective — one or two sentences stating what a trainee should be able to do after " +
  "studying this case (e.g. gathering the right missing information, connecting objective " +
  "findings to life context before concluding an assessment); " +
  "teachingPoints — a list of short, concrete, individually-teachable points extracted from " +
  "the comment (e.g. 'do not conclude from a single blood pressure reading alone', 'check home " +
  "blood pressure, past checkup results, medical history, medication adherence, sleep, work, " +
  "and alcohol use before assessing', 'connect the client's life context — such as being busy " +
  "at work or eating out often — to the assessment instead of stating it separately', 'do not " +
  "end the assessment with a mere restatement of the objective findings', 'design a plan the " +
  "client can realistically carry out together with them, rather than one-sided instruction'). " +
  "Ground every field in what the comment actually says; do not invent clinical facts, patient " +
  "details, or advice that is not present in or a reasonable generalization of the comment. " +
  "Respond in Japanese.";

/**
 * 教材候補生成の model を解決する。
 *
 * `config.teachingMaterialModelId`（任意）が設定されていればそちらを使い、未設定なら
 * supervisor と同じ `config.modelId` にフォールバックする（soap_draft/soap_gaps と同じ方針）。
 */
function resolveTeachingMaterialModel(deps: AgentDeps): Model {
  if (deps.modelFor) {
    return deps.modelFor("teaching_material");
  }
  return makeBedrockModel({
    ...deps.config,
    modelId: deps.config.teachingMaterialModelId || deps.config.modelId,
  });
}

/** 教材候補生成用の Agent を生成する。structuredOutputSchema で title/学習目標/指導ポイントを型付きで受け取る。 */
export function buildTeachingMaterialAgent(deps: AgentDeps): Agent {
  return new Agent({
    name: TEACHING_MATERIAL_AGENT_NAME,
    model: resolveTeachingMaterialModel(deps),
    systemPrompt: TEACHING_MATERIAL_SYSTEM_PROMPT,
    structuredOutputSchema: teachingMaterialOutputSchema,
    printer: false,
  });
}
