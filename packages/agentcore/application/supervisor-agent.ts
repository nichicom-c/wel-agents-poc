/**
 * supervisor agent を組み立てる。
 *
 * supervisor は複数の専門 agent を tool として持ち、質問に応じて単一または複数の専門 tool を
 * 呼び分ける。専門 agent の定義と生成は `specialists/` 配下の各 domain file に閉じる。
 */

import { Agent, type Tool } from "@strands-agents/sdk";

import { type AgentDeps, modelFor } from "./agent-deps.ts";
import {
  buildDatabaseTool,
  DATABASE_TOOL_NAME,
} from "./specialists/database-agent.ts";
import {
  buildDocumentTool,
  DOCUMENT_TOOL_NAME,
} from "./specialists/document-agent.ts";
import { buildLawTool, LAW_TOOL_NAME } from "./specialists/law-agent.ts";
import {
  buildMedicalCareLawTool,
  MEDICAL_CARE_LAW_TOOL_NAME,
} from "./specialists/medical-care-law-agent.ts";
import {
  buildSupportActivityTool,
  SUPPORT_ACTIVITY_TOOL_NAME,
} from "./specialists/support-activity-agent.ts";

export type { AgentDeps } from "./agent-deps.ts";

/**
 * SUPERVISOR_SYSTEM_PROMPT の日本語訳:
 *
 * あなたは supervisor であり、ユーザーの質問を最も適切な専門 agent に振り分け、その結果を
 * 1つの簡潔な回答に統合する。専門 agent は以下のとおり:
 * - database_rag_agent: サンプル業務データ (顧客 / 注文 / 商品) に関する質問。
 * - document_rag_agent: 社内文書・ポリシー・FAQ に関する質問。
 * - law_rag_agent: 日本の法律、特に児童虐待防止法 (児童虐待の防止等に関する法律) に関する質問
 *   — その条文・定義・通告義務・措置など。
 * - medical_care_law_rag_agent: 保険診療 基本法令テキストブックに基づく、日本の保険診療
 *   (健康保険による医療) に関する質問 — 医療保険制度・公費負担医療制度・保険医療機関と保険医・
 *   療養担当規則・診療報酬請求と審査制度・医療関係法規・介護保険制度。
 * - support_activity_rag_agent: 合成された自治体の支援活動の構造化データに関する質問
 *   — 住民台帳・世帯・支援ケース・活動ログ・件数・対応期限ケース・訪問・電話・窓口対応など。
 * 質問に対して最適な専門 agent を1つ選び、その tool を呼び出すこと。質問が明確に複数のドメインに
 * またがる場合は、複数の専門 agent を呼び出してそれらの回答を統合してよい。法律ドメインは区別すること:
 * law_rag_agent は日本の一次法令 (児童虐待防止法 の一次法令) を扱い、medical_care_law_rag_agent は
 * 保険診療 基本法令テキストブックという保険診療の学習教材を扱う。構造化データも区別すること:
 * support_activity_rag_agent は自治体の支援活動の行データと集計を扱い、database_rag_agent は
 * 顧客 / 注文 / 商品 を扱う。日本の法律に関する質問では、該当する専門 agent に委譲し、出典の根拠なしに
 * 自分の知識から回答しないこと。専門 agent に問い合わせることなく、自分の事前知識から回答してはならない。
 */
export const SUPERVISOR_SYSTEM_PROMPT =
  "You are a supervisor that routes a user's question to the most appropriate specialist " +
  "agent and integrates the result into a single concise answer. The specialists are:\n" +
  `- ${DATABASE_TOOL_NAME}: questions about the sample business data (customers/orders/products).\n` +
  `- ${DOCUMENT_TOOL_NAME}: questions about internal documents, policies, and FAQs.\n` +
  `- ${LAW_TOOL_NAME}: questions about Japanese law, specifically the 児童虐待防止法 ` +
  "(児童虐待の防止等に関する法律) — its 条文, 定義, 通告義務, 措置, etc.\n" +
  `- ${MEDICAL_CARE_LAW_TOOL_NAME}: questions about Japanese health-insurance medical care ` +
  "(保険診療) grounded in the 保険診療 基本法令テキストブック — 医療保険制度, 公費負担医療制度, " +
  "保険医療機関と保険医, 療養担当規則, 診療報酬請求と審査制度, 医療関係法規, 介護保険制度.\n" +
  `- ${SUPPORT_ACTIVITY_TOOL_NAME}: questions about the synthetic municipal support activity ` +
  "structured data — resident ledger, households, support cases, activity logs, counts, due cases, visits, phone, and counter activities.\n" +
  "Choose the single best specialist for the question and call its tool. If a question " +
  "clearly spans more than one domain, you may call multiple specialists and combine their " +
  "answers. Keep the law domains distinct: law_rag_agent is for primary Japanese statutes " +
  "(児童虐待防止法 の一次法令), while medical_care_law_rag_agent is for the 保険診療 基本法令テキストブック " +
  "study material on health-insurance medical care. Keep structured data distinct: support_activity_rag_agent " +
  "is for municipal support activity rows and aggregates, while database_rag_agent is for customers/orders/products. For Japanese-law questions, delegate to the " +
  "matching specialist and do not answer from your own knowledge without a source basis. Never " +
  "answer from your own prior knowledge without consulting a specialist.";

/** 複数の専門 agent を supervisor 用 tool に変換して返す。 */
export function buildSpecialistTools(deps: AgentDeps): Tool[] {
  return [
    buildDatabaseTool(deps),
    buildDocumentTool(deps),
    buildLawTool(deps),
    buildMedicalCareLawTool(deps),
    buildSupportActivityTool(deps),
  ];
}

/** 専門 tool を束ねた supervisor Agent を生成する。 */
export function buildSupervisor(deps: AgentDeps): Agent {
  return new Agent({
    name: "supervisor",
    model: modelFor(deps, "supervisor"),
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
    tools: buildSpecialistTools(deps),
    printer: false,
  });
}
