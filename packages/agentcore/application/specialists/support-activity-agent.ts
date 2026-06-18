/**
 * support activity domain 専門 structured-data RAG agent。
 *
 * Bedrock SQL Knowledge Base provider に自然言語 query だけを渡す
 * structured-data tool として扱う。
 */

import { Agent, type Tool } from "@strands-agents/sdk";
import {
  makeStructuredDataTool,
  type StructuredDataProvider,
} from "../../infra/structured-data.ts";
import { makeBedrockStructuredDataProvider } from "../../infra/structured-data-bedrock.ts";
import { type AgentDeps, modelFor } from "../agent-deps.ts";

export const SUPPORT_ACTIVITY_TOOL_NAME = "support_activity_rag_agent";
/**
 * SUPPORT_ACTIVITY_TOOL_DESCRIPTION の日本語訳:
 *
 * 合成された自治体の支援活動の構造化データ (住民台帳・世帯・支援ケース・支援活動ログ) に関する質問に
 * 答える。件数・絞り込み・対応期限ケース・訪問・電話 / 窓口対応、およびテーブル横断の集計にはこれを使う。
 */
export const SUPPORT_ACTIVITY_TOOL_DESCRIPTION =
  "Answer questions about the synthetic municipal support activity structured data " +
  "(resident ledger, households, support cases, and support activity logs). Use this " +
  "for counts, filters, due cases, visits, phone/counter activities, and cross-table summaries.";

/**
 * SUPPORT_ACTIVITY_SYSTEM_PROMPT の日本語訳:
 *
 * あなたは自治体の支援活動データのアナリスト。回答前に必ず最初に query_structured_data tool を呼び出す。
 * 必要な住民台帳・世帯・支援ケース・支援活動ログのデータを tool に問い合わせ、その後返された行または集計のみに
 * 厳密に基づいて回答する。Bedrock SQL Knowledge Bases が SQL を生成できるよう、tool への query は英語の
 * 自然言語で送る。ユーザーが日本語で尋ねた場合は最終回答を日本語で書いてよい。tool の出力に存在しない住民・
 * ケース・活動・件数をでっち上げてはならない。この agent は支援活動の構造化データ専用であり、別個の
 * 顧客 / 注文 / 商品 のサンプルデータには database_rag_agent を使う。
 */
const SUPPORT_ACTIVITY_SYSTEM_PROMPT =
  "You are a municipal support activity data analyst. Always call your " +
  "query_structured_data tool first before answering. Ask the tool for the " +
  "needed resident ledger, household, support case, or support activity log data, " +
  "then answer strictly from the returned rows or aggregates. Submit the tool query " +
  "in English natural language so Bedrock SQL Knowledge Bases can generate SQL; " +
  "you may write the final answer in Japanese when the user asks in Japanese. Do " +
  "not invent residents, cases, activities, or counts that are not present in the " +
  "tool output. This agent is only for support activity structured data; use " +
  "database_rag_agent for the separate customers/orders/products sample data.";

export function buildSupportActivityAgent(deps: AgentDeps): Agent {
  const structuredDataTool = makeStructuredDataTool(
    makeSupportActivityProvider(deps),
  );

  return new Agent({
    name: SUPPORT_ACTIVITY_TOOL_NAME,
    description: SUPPORT_ACTIVITY_TOOL_DESCRIPTION,
    model: modelFor(deps, "support_activity"),
    systemPrompt: SUPPORT_ACTIVITY_SYSTEM_PROMPT,
    tools: [structuredDataTool],
    printer: false,
  });
}

export function buildSupportActivityTool(deps: AgentDeps): Tool {
  return buildSupportActivityAgent(deps).asTool({
    name: SUPPORT_ACTIVITY_TOOL_NAME,
    description: SUPPORT_ACTIVITY_TOOL_DESCRIPTION,
  });
}

function makeSupportActivityProvider(deps: AgentDeps): StructuredDataProvider {
  if (deps.supportActivityProvider) {
    return deps.supportActivityProvider;
  }
  const { supportActivity } = deps.config;
  return makeBedrockStructuredDataProvider({
    knowledgeBaseId: supportActivity.kbId,
    knowledgeBaseArn: supportActivity.kbArn,
    region: deps.config.region,
    includeGeneratedSql: supportActivity.includeGeneratedSql,
  });
}
