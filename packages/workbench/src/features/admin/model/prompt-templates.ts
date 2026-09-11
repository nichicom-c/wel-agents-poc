/**
 * 保健師SOAP_KB_詳細設計書_v2 の prompt_template。BFF `/api/prompt-templates` から取得する。
 * 今回は Admin での一覧・作成のみ（AgentCore 実行時には未接続、将来対応）。
 */
export type PromptTemplate = {
  id: string;
  knowledgeBaseId: string;
  code: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  version: string;
  isActive: boolean;
  createdAt: string;
};
