/**
 * database domain 専門 RAG agent。
 *
 * sample business data 用 KB ID を closure に束縛し、model からは query だけが見える KB search tool を持つ。
 */

import { Agent, type Tool } from "@strands-agents/sdk";

import { makeKbSearchTool } from "../../infra/knowledge-base.ts";
import { type AgentDeps, modelFor } from "../agent-deps.ts";

export const DATABASE_TOOL_NAME = "database_rag_agent";
/**
 * DATABASE_TOOL_DESCRIPTION の日本語訳:
 *
 * 軽量な CSV / Markdown の「データベース」レコードとして保存されたサンプル業務データ
 * (顧客・注文・商品) に関する質問に答える。そのデータ内の特定の行・件数・関係に関する質問には
 * これを使う。
 */
export const DATABASE_TOOL_DESCRIPTION =
  "Answer questions about the sample business data (customers, orders, products) " +
  "stored as lightweight CSV/Markdown 'database' records. Use this for questions " +
  "about specific rows, counts, or relationships in that data.";

/**
 * DATABASE_SYSTEM_PROMPT の日本語訳:
 *
 * あなたは小規模なサンプルデータセットのデータアナリスト。関連レコードを取得するため、必ず最初に
 * search_knowledge_base tool を呼び出し、その後それらのレコードのみに厳密に基づいて回答する。
 * 存在しない行をでっち上げてはならない。
 */
const DATABASE_SYSTEM_PROMPT =
  "You are a data analyst for a small sample dataset. Always call your " +
  "search_knowledge_base tool first to retrieve the relevant records, then answer " +
  "strictly from those records. Do not invent rows that are not present.";

export function buildDatabaseAgent(deps: AgentDeps): Agent {
  const kbTool = makeKbSearchTool(deps.config.kbIds.database, {
    region: deps.config.region,
    numberOfResults: deps.config.numberOfResults,
    client: deps.kbClient,
  });

  return new Agent({
    name: DATABASE_TOOL_NAME,
    description: DATABASE_TOOL_DESCRIPTION,
    model: modelFor(deps, "database"),
    systemPrompt: DATABASE_SYSTEM_PROMPT,
    tools: [kbTool],
    printer: false,
  });
}

export function buildDatabaseTool(deps: AgentDeps): Tool {
  return buildDatabaseAgent(deps).asTool({
    name: DATABASE_TOOL_NAME,
    description: DATABASE_TOOL_DESCRIPTION,
  });
}
