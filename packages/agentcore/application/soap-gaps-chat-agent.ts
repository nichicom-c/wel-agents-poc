/**
 * 不足確認チャット agent を組み立てる。
 *
 * 「次にどの不足を扱うか」は呼び出し側（BFF/Workbench）が決定的に管理するため、この agent は
 * 渡された1件の不足を会話的に提示・深掘りするだけに専念する単発 agent。SOAP 下書き生成・
 * 不足検出と同様、supervisor の tool ではなく SOAP Studio の「不足確認」画面から直接呼ばれる。
 */

import { Agent, type Model } from "@strands-agents/sdk";
import { soapGapsChatOutputSchema } from "../contracts/soap-gaps-chat.ts";
import {
  formatKnowledgeContext,
  type KnowledgeContextItem,
} from "../domain/knowledge-context.ts";
import { makeBedrockModel } from "../infra/model.ts";
import type { AgentDeps } from "./agent-deps.ts";

export const SOAP_GAPS_CHAT_AGENT_NAME = "soap_gaps_chat_agent";

/**
 * SOAP_GAPS_CHAT_SYSTEM_PROMPT の要旨:
 *
 * 与えられた1件の不足（gapType/soapCategory/targetItem/detail/relatedEvidenceQuotes/
 * skippable）、現在のSOAP候補、会話履歴、利用者の今回の発言（任意）をもとに会話する。
 * 初回ターン（発言なし）：不足を断定せず自然な問いかけとして提示し、断定しない0〜3件の
 * 言い回し候補（suggestions）を提案する（ブレインストーミング。既存の証拠にのみ基づき、
 * 新しい事実を創作しない）。resolvedはfalse。
 * 発言があるターン：具体的な情報が得られればresolved:trueとし、利用者が述べた内容のみから
 * candidateTextを組み立てる（捏造禁止）。曖昧なら resolved:false で1点だけ深掘りする。
 * 「わからない」「スキップ」等の意思表示は尊重してresolved:true・candidateTextなしで終える
 * （skippable:falseの不足は一度だけ専門職確認を促してから終える）。
 */
const SOAP_GAPS_CHAT_SYSTEM_PROMPT =
  "You are a supportive brainstorming partner helping a novice public health nurse complete " +
  "ONE specific gap in a support-record SOAP draft, through a short back-and-forth conversation " +
  "in Japanese. You are given: the gap to discuss (its gapType, target soapCategory, a mechanical " +
  "'detail' description of what is missing/ambiguous/contradictory, whether it is skippable, and " +
  "quoted evidence from the existing draft), the current SOAP draft candidates for context, the " +
  "recent conversation history (if any), and optionally the user's latest reply. " +
  "ON THE OPENING TURN (no user reply yet, or the message is explicitly a request to present the " +
  "gap): rephrase the gap as a natural, friendly question in Japanese — NEVER present the " +
  "mechanical 'detail' text verbatim as if it were already an established fact; always frame it as " +
  "something to check. Additionally propose 0 to 3 short example phrasings the nurse could " +
  "consider (suggestions) — these are brainstormed possibilities for the nurse to pick from, edit, " +
  "or ignore, NOT assertions of fact; ground them only in the given evidence/candidates and never " +
  "invent specific values (dates, numbers, names, medical facts) that are not already present. Set " +
  "resolved to false and leave candidateText unset. " +
  "WHEN THE USER HAS REPLIED: read their reply carefully. If it gives concrete, usable information " +
  "for the target soapCategory, set resolved to true and write candidateText: a concise sentence or " +
  "two, in the appropriate SOAP style for that category, built ONLY from what the user just said " +
  "(plus already-known context) — never add specifics the user did not state. If the reply is " +
  "vague, incomplete, or itself raises a question, set resolved to false, ask ONE focused follow-up " +
  "question in message, and optionally offer new suggestions grounded in what they said so far. If " +
  "the user indicates they don't know or want to skip (e.g. phrases like 'わからない', 'スキップ', " +
  "'skip', 'パス'): respect it — set resolved to true with candidateText left unset; if the gap's " +
  "skippable is false, first briefly note in message that a professional should confirm this before " +
  "moving on, but still end the turn with resolved:true (never loop forever on a single gap). " +
  "Always write message in natural, polite Japanese, concise (a few sentences at most). Never " +
  "fabricate clinical facts, dates, names, or measurements that were not given to you.";

/**
 * 不足確認チャットの model を解決する。
 *
 * `soap_gaps` の意味検出・質問系タスクと同じ `config.soapGapsModelId`（任意）を共有する。
 * テストでは `deps.modelFor` で丸ごと差し替えられる。
 */
function resolveSoapGapsChatModel(deps: AgentDeps): Model {
  if (deps.modelFor) {
    return deps.modelFor("soap_gaps_chat");
  }
  return makeBedrockModel({
    ...deps.config,
    modelId: deps.config.soapGapsModelId || deps.config.modelId,
  });
}

/**
 * 不足確認チャット用の Agent を生成する。structuredOutputSchema で発言・候補・resolved・
 * candidateText を型付きで受け取る。
 *
 * `knowledgeContext`（保健師SOAP_KB_詳細設計書_v2 の knowledge_item、BFF が active な
 * SOAP_RULE/SAFETY/FEEDBACK_POLICY を取得して渡す）が与えられれば、他の一発 agent と同様
 * システムプロンプト末尾に補足コンテキストとして追記する。
 */
export function buildSoapGapsChatAgent(
  deps: AgentDeps,
  knowledgeContext: KnowledgeContextItem[] = [],
): Agent {
  return new Agent({
    name: SOAP_GAPS_CHAT_AGENT_NAME,
    model: resolveSoapGapsChatModel(deps),
    systemPrompt:
      SOAP_GAPS_CHAT_SYSTEM_PROMPT + formatKnowledgeContext(knowledgeContext),
    structuredOutputSchema: soapGapsChatOutputSchema,
    printer: false,
  });
}
