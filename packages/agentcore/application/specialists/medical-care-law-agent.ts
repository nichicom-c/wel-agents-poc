/**
 * medical_care_law domain 専門 RAG agent。
 *
 * 「保険診療 基本法令テキストブック」の OCR corpus を持つ dedicated KB ID を closure に束縛し、
 * model からは query だけが見える KB search tool を持つ。回答は教材本文を根拠にし、出典（書名・章・
 * ページ）を示し、内部参照用であって診療報酬請求・法令解釈・行政手続の最終判断ではないことを
 * system prompt に含める。
 */

import { Agent, type Tool } from "@strands-agents/sdk";

import { makeKbSearchTool } from "../../infra/knowledge-base.ts";
import { type AgentDeps, modelFor } from "../agent-deps.ts";

export const MEDICAL_CARE_LAW_TOOL_NAME = "medical_care_law_rag_agent";
/**
 * MEDICAL_CARE_LAW_TOOL_DESCRIPTION の日本語訳:
 *
 * 保険診療 基本法令テキストブックに基づき、日本の保険診療 (健康保険による医療) に関する質問に答える。
 * 医療保険制度・公費負担医療制度・保険医療機関と保険医・療養担当規則・診療報酬請求と審査制度・
 * 医療関係法規、および介護保険制度の参考セクションにはこれを使う。
 */
export const MEDICAL_CARE_LAW_TOOL_DESCRIPTION =
  "Answer questions about Japanese health-insurance medical care (保険診療) grounded in the " +
  "保険診療 基本法令テキストブック. Use this for 医療保険制度, 公費負担医療制度, 保険医療機関と保険医, " +
  "療養担当規則, 診療報酬請求と審査制度, 医療関係法規, and the 介護保険制度 reference section.";

/**
 * MEDICAL_CARE_LAW_SYSTEM_PROMPT の日本語訳:
 *
 * あなたは保険診療 基本法令テキストブック (日本の保険診療に関する、スキャン・OCR 処理された学習教材) の
 * リファレンスアシスタント。必ず最初に search_knowledge_base tool を呼び出し、取得した教材本文のみに
 * すべての回答を厳密に基づかせる — 自分の事前知識から回答してはならない。保険診療・医療保険制度・
 * 公費負担医療制度・保険医療機関と保険医・療養担当規則・診療報酬請求と審査制度・医療関係法規、および
 * 介護保険制度の参考セクションを対象とする。回答時には、取得した chunk の metadata から出典の書名
 * (保険診療 基本法令テキストブック)・章・出力ページを引用する。これが内部参照専用の OCR 処理済み学習教材で
 * あり、診療報酬請求・法令解釈・行政手続の最終判断ではないことを明確にする。ユーザーの言語 (既定は日本語) で
 * 回答する。関連する chunk が取得できなければ、推測せず関連情報が見つからなかったと伝える。
 */
const MEDICAL_CARE_LAW_SYSTEM_PROMPT =
  "You are a reference assistant for the 保険診療 基本法令テキストブック (a scanned, OCR-processed " +
  "study text on Japanese health-insurance medical care). Always call your search_knowledge_base " +
  "tool first and ground every answer strictly in the retrieved 教材本文 — never answer from your " +
  "own prior knowledge. Cover 保険診療, 医療保険制度, 公費負担医療制度, 保険医療機関と保険医, " +
  "療養担当規則, 診療報酬請求と審査制度, 医療関係法規, and the 介護保険制度 reference section. " +
  "When you answer, cite the source title (保険診療 基本法令テキストブック), the chapter (章), and the " +
  "page (出力ページ) from the retrieved chunk's metadata. Make clear that this is OCR-processed study " +
  "material for internal reference only — not a final judgment on 診療報酬請求, 法令解釈, or 行政手続. " +
  "Answer in the user's language (default 日本語). If no relevant chunk is retrieved, say that no " +
  "relevant information was found instead of guessing.";

export function buildMedicalCareLawAgent(deps: AgentDeps): Agent {
  const kbTool = makeKbSearchTool(deps.config.kbIds.medical_care_law, {
    region: deps.config.region,
    numberOfResults: deps.config.numberOfResults,
    client: deps.kbClient,
  });

  return new Agent({
    name: MEDICAL_CARE_LAW_TOOL_NAME,
    description: MEDICAL_CARE_LAW_TOOL_DESCRIPTION,
    model: modelFor(deps, "medical_care_law"),
    systemPrompt: MEDICAL_CARE_LAW_SYSTEM_PROMPT,
    tools: [kbTool],
    printer: false,
  });
}

export function buildMedicalCareLawTool(deps: AgentDeps): Tool {
  return buildMedicalCareLawAgent(deps).asTool({
    name: MEDICAL_CARE_LAW_TOOL_NAME,
    description: MEDICAL_CARE_LAW_TOOL_DESCRIPTION,
  });
}
