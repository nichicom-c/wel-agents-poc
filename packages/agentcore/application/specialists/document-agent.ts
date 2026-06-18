/**
 * document domain 専門 RAG agent。
 *
 * internal documents 用 KB ID を closure に束縛し、model からは query だけが見える KB search tool を持つ。
 */

import { Agent, type Tool } from "@strands-agents/sdk";

import { makeKbSearchTool } from "../../infra/knowledge-base.ts";
import { type AgentDeps, modelFor } from "../agent-deps.ts";

export const DOCUMENT_TOOL_NAME = "document_rag_agent";
/**
 * DOCUMENT_TOOL_DESCRIPTION の日本語訳:
 *
 * Markdown / PDF 文書として保存された社内文書・ポリシー (ハンドブック・ガイドライン・FAQ) に関する
 * 質問に答える。ポリシー・業務プロセス・FAQ の質問にはこれを使う。
 */
export const DOCUMENT_TOOL_DESCRIPTION =
  "Answer questions about internal documents and policies (handbook, guidelines, " +
  "FAQs) stored as Markdown/PDF documents. Use this for policy/process/FAQ questions.";

/**
 * DOCUMENT_SYSTEM_PROMPT の日本語訳:
 *
 * あなたは文書アシスタント。関連する箇所を見つけるため、必ず最初に search_knowledge_base tool を
 * 呼び出し、その後簡潔に回答して、役立つ場合は文書を引用する。関連情報が見つからなければその旨を伝える。
 */
const DOCUMENT_SYSTEM_PROMPT =
  "You are a documentation assistant. Always call your search_knowledge_base tool " +
  "first to find the relevant passages, then answer concisely and quote the " +
  "document where helpful. If nothing relevant is found, say so.";

export function buildDocumentAgent(deps: AgentDeps): Agent {
  const kbTool = makeKbSearchTool(deps.config.kbIds.document, {
    region: deps.config.region,
    numberOfResults: deps.config.numberOfResults,
    client: deps.kbClient,
  });

  return new Agent({
    name: DOCUMENT_TOOL_NAME,
    description: DOCUMENT_TOOL_DESCRIPTION,
    model: modelFor(deps, "document"),
    systemPrompt: DOCUMENT_SYSTEM_PROMPT,
    tools: [kbTool],
    printer: false,
  });
}

export function buildDocumentTool(deps: AgentDeps): Tool {
  return buildDocumentAgent(deps).asTool({
    name: DOCUMENT_TOOL_NAME,
    description: DOCUMENT_TOOL_DESCRIPTION,
  });
}
