/**
 * hokenshi_kiroku domain 専門 RAG agent。
 *
 * 書籍『こう書けばわかる！保健師記録』（医学書院）を Markdown 化した corpus を持つ dedicated KB ID を
 * closure に束縛し、model からは query だけが見える KB search tool を持つ。回答は書籍本文を根拠にし、
 * 出典（書名・編・単元・ページ）を示し、内部参照用であって保健師記録の実務判断・法令解釈・行政手続の
 * 最終判断ではないことを system prompt に含める。
 */

import { Agent, type Tool } from "@strands-agents/sdk";

import { makeKbSearchTool } from "../../infra/knowledge-base.ts";
import { type AgentDeps, modelFor } from "../agent-deps.ts";

export const HOKENSHI_KIROKU_TOOL_NAME = "hokenshi_kiroku_rag_agent";
/**
 * HOKENSHI_KIROKU_TOOL_DESCRIPTION の日本語訳:
 *
 * 書籍『こう書けばわかる！保健師記録』に基づき、保健師記録の書き方に関する質問に答える。
 * 記録の開示と文書管理・保健師記録のガイドライン・Plan/Do/See による記録・良い記録の条件・
 * 精神障害者のインテーク面接記録・虐待を疑う母子の訪問記録・SOAP ノート・多職種連携のための
 * 会議録とサマリー・グループ支援記録・情報公開と個人情報保護・記録の管理と行政評価・記録様式の
 * フォーマット例には、これを使う。
 */
export const HOKENSHI_KIROKU_TOOL_DESCRIPTION =
  "Answer questions about how 保健師 (public health nurses) should write their records (保健師記録), " +
  "grounded in the guidebook こう書けばわかる！保健師記録. Use this for 記録の開示と文書管理, " +
  "保健師記録のガイドライン, Plan/Do/See で書く記録, 良い記録を書くための条件, 精神障害者のインテーク面接記録, " +
  "虐待を疑う母子の訪問記録, SOAP ノート, 連携・協働のための会議録とサマリー, グループ支援記録, " +
  "情報公開法と個人情報保護制度, 記録の管理と行政評価, and 記録様式のフォーマット例.";

/**
 * HOKENSHI_KIROKU_SYSTEM_PROMPT の日本語訳:
 *
 * あなたは『こう書けばわかる！保健師記録』（保健師記録の書き方に関する日本語の実務書を Markdown 化した
 * もの）のリファレンスアシスタント。必ず最初に search_knowledge_base tool を呼び出し、取得した書籍本文のみに
 * すべての回答を厳密に基づかせる — 自分の事前知識から回答してはならない。記録の開示と文書管理・保健師記録の
 * ガイドライン・Plan/Do/See による記録・良い記録を書くための条件・精神障害者のインテーク面接記録・
 * 虐待を疑う母子の訪問記録・SOAP ノート・多職種連携のための会議録とサマリー・グループ支援記録・
 * 情報公開法と個人情報保護制度・記録の管理と行政評価・記録様式のフォーマット例を対象とする。回答時には、
 * 取得した chunk の metadata から出典の書名（こう書けばわかる！保健師記録）・編と単元（section_title /
 * unit_title）・ページ（output_page）を引用する。これが内部参照専用の書籍抜粋であり、保健師記録の実務判断・
 * 法令解釈・行政手続の最終判断ではないことを明確にする。ユーザーの言語（既定は日本語）で回答する。関連する
 * chunk が取得できなければ、推測せず関連情報が見つからなかったと伝える。
 */
const HOKENSHI_KIROKU_SYSTEM_PROMPT =
  "You are a reference assistant for こう書けばわかる！保健師記録 (a Japanese practitioner guidebook on " +
  "how public health nurses should write their records, converted to Markdown). Always call your " +
  "search_knowledge_base tool first and ground every answer strictly in the retrieved 書籍本文 — never " +
  "answer from your own prior knowledge. Cover 記録の開示と文書管理, 保健師記録のガイドライン, " +
  "Plan/Do/See で書く記録, 良い記録を書くための条件, 精神障害者のインテーク面接記録, 虐待を疑う母子の訪問記録, " +
  "SOAP ノート, 連携・協働のための会議録とサマリー, グループ支援記録, 情報公開法と個人情報保護制度, " +
  "記録の管理と行政評価, and 記録様式のフォーマット例. When you answer, cite the source title " +
  "(こう書けばわかる！保健師記録), the 編 and 単元 (section_title / unit_title), and the page (output_page) " +
  "from the retrieved chunk's metadata. Make clear that this is a book excerpt for internal reference " +
  "only — not a final judgment on 保健師記録の実務判断, 法令解釈, or 行政手続. Answer in the user's language " +
  "(default 日本語). If no relevant chunk is retrieved, say that no relevant information was found " +
  "instead of guessing.";

export function buildHokenshiKirokuAgent(deps: AgentDeps): Agent {
  const kbTool = makeKbSearchTool(deps.config.kbIds.hokenshi_kiroku, {
    region: deps.config.region,
    numberOfResults: deps.config.numberOfResults,
    client: deps.kbClient,
  });

  return new Agent({
    name: HOKENSHI_KIROKU_TOOL_NAME,
    description: HOKENSHI_KIROKU_TOOL_DESCRIPTION,
    model: modelFor(deps, "hokenshi_kiroku"),
    systemPrompt: HOKENSHI_KIROKU_SYSTEM_PROMPT,
    tools: [kbTool],
    printer: false,
  });
}

export function buildHokenshiKirokuTool(deps: AgentDeps): Tool {
  return buildHokenshiKirokuAgent(deps).asTool({
    name: HOKENSHI_KIROKU_TOOL_NAME,
    description: HOKENSHI_KIROKU_TOOL_DESCRIPTION,
  });
}
