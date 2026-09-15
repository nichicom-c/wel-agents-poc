/**
 * 教材チャット agent を組み立てる。
 *
 * supervisor（`supervisor-agent.ts`）は「専門 tool に確認せず自分の知識で答えてはならない」という
 * 制約を持ち、5つの固定ドメイン（database/document/law/medical_care_law/support_activity）
 * にしか対応しない。教材チャットは Training 画面が渡す教材の title/学習目標/指導のポイントを
 * 唯一の情報源として自由に対話する必要があるため、supervisor とは別の専用 agent とする
 * （tool を持たず、渡された教材文脈を正として応答する）。
 */

import { Agent, type Model } from "@strands-agents/sdk";
import { makeBedrockModel } from "../infra/model.ts";
import type { AgentDeps } from "./agent-deps.ts";

export const MATERIAL_CHAT_AGENT_NAME = "material_chat_agent";

/**
 * MATERIAL_CHAT_SYSTEM_PROMPT の要旨:
 *
 * 新人保健師(トレーニー)と、1つの教材について対話する指導アシスタント。教材のタイトル・
 * 学習目標・指導のポイントが唯一かつ正当な情報源であり、それをどこか外部の知識ベースで
 * 検索・照合する必要はない(「ナレッジベースに見当たらない」のような拒否をしない)。
 * 初回ターン(会話履歴が無い)では教材の要点を簡潔に紹介し、質問を促す。以降のターンでは
 * トレーニーの発言に、渡された教材内容を根拠に応答する。教材に無い事実は創作しない。
 */
const MATERIAL_CHAT_SYSTEM_PROMPT =
  "You are a friendly instructional assistant chatting one-on-one with a newly-qualified public " +
  "health nurse (トレーニー) about ONE specific teaching material. You are given the material's " +
  "title, learning objective, and teaching points as your ONLY and fully authoritative source for " +
  "this conversation — treat this given content as ground truth to discuss, not as a topic you " +
  "need to look up in some external knowledge base. NEVER say the material is unavailable, not " +
  "found, or not covered by your knowledge bases — the content given to you IS the material, and " +
  "your job is to discuss it. " +
  "On the opening turn (no prior conversation given), briefly introduce the material's key points " +
  "in your own words and invite the trainee to ask questions or share their thoughts. On later " +
  "turns, respond to the trainee's latest message, grounding your answer in the given material " +
  "content and the conversation so far. If the trainee asks something the given material content " +
  "does not cover, say so honestly rather than inventing facts, but do not refuse to engage with " +
  "the material itself. Keep the tone supportive and conversational, not a lecture. Respond in " +
  "Japanese.";

/**
 * 教材チャットの model を解決する。
 *
 * `config.materialChatModelId`（任意）が設定されていればそちらを使い、未設定なら supervisor
 * と同じ `config.modelId` にフォールバックする（soap_draft/teaching_material と同じ方針）。
 */
function resolveMaterialChatModel(deps: AgentDeps): Model {
  if (deps.modelFor) {
    return deps.modelFor("material_chat");
  }
  return makeBedrockModel({
    ...deps.config,
    modelId: deps.config.materialChatModelId || deps.config.modelId,
  });
}

/** 教材チャット用の Agent を生成する。tool を持たない自由対話（構造化出力も使わない）。 */
export function buildMaterialChatAgent(deps: AgentDeps): Agent {
  return new Agent({
    name: MATERIAL_CHAT_AGENT_NAME,
    model: resolveMaterialChatModel(deps),
    systemPrompt: MATERIAL_CHAT_SYSTEM_PROMPT,
    printer: false,
  });
}
