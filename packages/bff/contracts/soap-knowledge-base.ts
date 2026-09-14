/**
 * 保健師SOAP_KB_詳細設計書_v2 の固定 Knowledge Base（knowledge_base / knowledge_item）の contract。
 * DB スキーマは `terraform/aws/bff/migrations/0004_create_knowledge_base.sql` に対応する。
 *
 * 命名注意: 既存の Bedrock vector Knowledge Base 管理（`contracts/knowledge-base-detail.ts`、
 * ルート `/api/knowledge-bases/{domain}`）とは無関係の別概念のため、コード上は一貫して
 * "SoapKnowledgeBase" / "soap-knowledge-base" と命名し、衝突を避ける。
 */

export const KNOWLEDGE_BASE_STATUSES = ["draft", "active", "archived"] as const;

export type KnowledgeBaseStatus = (typeof KNOWLEDGE_BASE_STATUSES)[number];

export function isKnowledgeBaseStatus(
  value: unknown,
): value is KnowledgeBaseStatus {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_BASE_STATUSES as readonly string[]).includes(value)
  );
}

export const KNOWLEDGE_ITEM_CATEGORIES = [
  "SOAP_RULE",
  "SAFETY",
  "FEEDBACK_POLICY",
  "DOMAIN_RULE",
  "EXAMPLE",
  "GUIDELINE_REF",
] as const;

export type KnowledgeItemCategory = (typeof KNOWLEDGE_ITEM_CATEGORIES)[number];

export function isKnowledgeItemCategory(
  value: unknown,
): value is KnowledgeItemCategory {
  return (
    typeof value === "string" &&
    (KNOWLEDGE_ITEM_CATEGORIES as readonly string[]).includes(value)
  );
}

/** 設計書6.2節: AIレビュー時に常時投入するカテゴリ。 */
export const ALWAYS_INCLUDED_KNOWLEDGE_CATEGORIES = [
  "SOAP_RULE",
  "SAFETY",
  "FEEDBACK_POLICY",
] as const satisfies readonly KnowledgeItemCategory[];

export type SoapKnowledgeBase = {
  id: string;
  code: string;
  name: string;
  description?: string;
  version: string;
  status: KnowledgeBaseStatus;
  createdAt: string;
  updatedAt: string;
};

export type SoapKnowledgeItem = {
  id: string;
  knowledgeBaseId: string;
  category: KnowledgeItemCategory;
  itemKey: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  version: string;
  isActive: boolean;
  createdAt: string;
};

export type CreateSoapKnowledgeBaseInput = {
  code: string;
  name: string;
  description?: string;
  version: string;
  status?: KnowledgeBaseStatus;
};

export type CreateSoapKnowledgeItemInput = {
  knowledgeBaseId: string;
  category: KnowledgeItemCategory;
  itemKey: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  version?: string;
};
