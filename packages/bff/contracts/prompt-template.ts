/**
 * 保健師SOAP_KB_詳細設計書_v2 の prompt_template の contract。
 * DB スキーマは `terraform/aws/bff/migrations/0004_create_knowledge_base.sql` に対応する。
 *
 * 今回は Admin での CRUD のみを提供する。AgentCore 呼び出し時のシステムプロンプト全体を
 * ここから組み立てる統合は将来対応（現状のシステムプロンプトはコード側にハードコードされた
 * ままで、`knowledge_item` は補足コンテキストとして追記されるのみ）。
 */

export type PromptTemplate = {
  id: string;
  knowledgeBaseId: string;
  code: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: Record<string, unknown>;
  version: string;
  isActive: boolean;
  createdAt: string;
};

export type CreatePromptTemplateInput = {
  knowledgeBaseId: string;
  code: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema?: Record<string, unknown>;
  version?: string;
};
