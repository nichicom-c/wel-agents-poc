/**
 * law domain 専門 RAG agent。
 *
 * 児童虐待防止法（児童虐待の防止等に関する法律, asof=2025-04-01）の dedicated KB ID を closure に束縛し、
 * model からは query だけが見える KB search tool を持つ。回答は条文根拠を優先し、内部参照用であって
 * 法律助言ではないことを system prompt に含める。
 */

import { Agent, type Tool } from "@strands-agents/sdk";

import { makeKbSearchTool } from "../../infra/knowledge-base.ts";
import { type AgentDeps, modelFor } from "../agent-deps.ts";

export const LAW_TOOL_NAME = "law_rag_agent";
/**
 * LAW_TOOL_DESCRIPTION の日本語訳:
 *
 * 日本の法律、特に児童虐待防止法 (児童虐待の防止等に関する法律) に関する質問に答える。その条文・定義・
 * 通告義務・措置、および 2025-04-01 時点版の関連規定に関する質問にはこれを使う。
 */
export const LAW_TOOL_DESCRIPTION =
  "Answer questions about Japanese law, specifically the 児童虐待防止法 " +
  "(児童虐待の防止等に関する法律). Use this for questions about its 条文 (articles), " +
  "定義 (definitions), 通告義務 (reporting duty), 措置 (measures), and related provisions " +
  "of the 2025-04-01 時点版.";

/**
 * LAW_SYSTEM_PROMPT の日本語訳:
 *
 * あなたは児童虐待防止法 (児童虐待の防止等に関する法律, asof=2025-04-01) を対象とする日本法のリファレンス
 * アシスタント。必ず最初に search_knowledge_base tool を呼び出し、取得した条文テキストのみにすべての回答を
 * 厳密に基づかせる — 自分の事前知識から回答してはならない。回答時には、法律名 (児童虐待の防止等に関する法律)、
 * 該当する条番号 (例: 第六条) を示し、これが e-Gov 法令データから処理された 2025-04-01 時点版であること
 * (出典: デジタル庁 e-Gov 法令検索) を付記する。回答が内部参照専用であり法的助言ではないことを明確にする。
 * ユーザーの言語 (既定は日本語) で回答する。関連する条文が取得できなければ、推測せず関連情報が見つからなかったと
 * 伝える。
 */
const LAW_SYSTEM_PROMPT =
  "You are a Japanese-law reference assistant for the 児童虐待防止法 " +
  "(児童虐待の防止等に関する法律, asof=2025-04-01). Always call your search_knowledge_base " +
  "tool first and ground every answer strictly in the retrieved 条文 text — never answer from " +
  "your own prior knowledge. When you answer, identify the law title (児童虐待の防止等に関する法律), " +
  "the relevant article reference (例: 第六条), and note that this is the asof=2025-04-01 version " +
  "processed from e-Gov 法令データ (出典: デジタル庁 e-Gov 法令検索). Make clear that the answer is " +
  "for internal reference only and is not legal advice. Answer in the user's language (default 日本語). " +
  "If no relevant 条文 is retrieved, say that no relevant information was found instead of guessing.";

export function buildLawAgent(deps: AgentDeps): Agent {
  const kbTool = makeKbSearchTool(deps.config.kbIds.law, {
    region: deps.config.region,
    numberOfResults: deps.config.numberOfResults,
    client: deps.kbClient,
  });

  return new Agent({
    name: LAW_TOOL_NAME,
    description: LAW_TOOL_DESCRIPTION,
    model: modelFor(deps, "law"),
    systemPrompt: LAW_SYSTEM_PROMPT,
    tools: [kbTool],
    printer: false,
  });
}

export function buildLawTool(deps: AgentDeps): Tool {
  return buildLawAgent(deps).asTool({
    name: LAW_TOOL_NAME,
    description: LAW_TOOL_DESCRIPTION,
  });
}
