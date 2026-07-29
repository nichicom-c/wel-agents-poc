/**
 * 不足確認の質問文生成 agent を組み立てる。
 *
 * ルールベースで検出した不足（`domain/soap-gaps.ts`）を自然な日本語の質問へ変換するだけの
 * 単発 agent。不足の判定そのものはこの agent の役割ではない（issue #6: ルールベースの不足判定と
 * AI による質問文生成を分ける）。SOAP 下書き生成 agent と同様、supervisor の tool ではなく
 * SOAP Studio の「不足確認」画面から直接呼ばれる。
 */

import { Agent, type Model } from "@strands-agents/sdk";
import { aiGapQuestionListSchema } from "../contracts/soap-gaps.ts";
import { makeBedrockModel } from "../infra/model.ts";
import type { AgentDeps } from "./agent-deps.ts";

export const SOAP_GAPS_AGENT_NAME = "soap_gaps_agent";

/**
 * SOAP_GAPS_SYSTEM_PROMPT の要旨:
 *
 * 渡された不足（gapType / soapCategory / targetItem / detail）を、そのまま利用者に提示できる
 * 1問1意図の自然な日本語の質問に変換するアシスタント。新しい不足を発見したり、渡された不足を
 * 取捨選択したりせず、与えられた不足それぞれに対して必ず1件の質問を返す。gapType /
 * soapCategory / targetItem は渡された値のまま返す（呼び出し側が対応関係を突き合わせるため）。
 */
const SOAP_GAPS_SYSTEM_PROMPT =
  "You convert already-detected gaps in a support-record SOAP draft into natural, single-intent " +
  "follow-up questions in Japanese that can be shown directly to the user. You are given a " +
  "numbered list of gaps, each with a gapType, soapCategory, targetItem, and a mechanical " +
  "detail description. For EVERY gap you are given, return EXACTLY ONE question — never skip a " +
  "gap, never invent a new one. Each question must ask about ONE thing only (single intent), be " +
  "phrased politely and naturally in Japanese, and be answerable with a short piece of missing " +
  "information. Echo back the gapType, soapCategory, and targetItem values EXACTLY as given (do " +
  "not translate, reformat, or alter them) so the caller can match your questions back to the " +
  "original gaps.";

/**
 * 不足確認の質問生成 model を解決する。
 *
 * SOAP 下書き生成と同様、`config.soapGapsModelId`（任意）があればそちらを使い、無ければ
 * `config.modelId` にフォールバックする。テストでは `deps.modelFor` で丸ごと差し替えられる。
 */
function resolveSoapGapsModel(deps: AgentDeps): Model {
  if (deps.modelFor) {
    return deps.modelFor("soap_gaps");
  }
  return makeBedrockModel({
    ...deps.config,
    modelId: deps.config.soapGapsModelId || deps.config.modelId,
  });
}

/** 不足確認の質問生成用の Agent を生成する。structuredOutputSchema で質問配列を型付きで受け取る。 */
export function buildSoapGapsAgent(deps: AgentDeps): Agent {
  return new Agent({
    name: SOAP_GAPS_AGENT_NAME,
    model: resolveSoapGapsModel(deps),
    systemPrompt: SOAP_GAPS_SYSTEM_PROMPT,
    structuredOutputSchema: aiGapQuestionListSchema,
    printer: false,
  });
}
