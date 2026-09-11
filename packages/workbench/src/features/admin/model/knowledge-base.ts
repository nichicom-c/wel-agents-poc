/**
 * 保健師SOAP_KB_詳細設計書_v2 の固定 Knowledge Base（knowledge_base / knowledge_item）。
 * BFF `/api/soap-knowledge-base*`（Aurora Serverless v2 + RDS Data API）から取得する。
 *
 * 命名注意: 既存の Bedrock vector Knowledge Base（law/medical_care_law 等）とは無関係の
 * 別概念のため、型・関数名は一貫して "SoapKnowledgeBase" とする。
 */

export const KNOWLEDGE_BASE_STATUSES = ["draft", "active", "archived"] as const;

export type KnowledgeBaseStatus = (typeof KNOWLEDGE_BASE_STATUSES)[number];

const KNOWLEDGE_BASE_STATUS_LABELS: Record<KnowledgeBaseStatus, string> = {
  active: "有効",
  archived: "アーカイブ済み",
  draft: "下書き",
};

export function knowledgeBaseStatusLabel(status: KnowledgeBaseStatus): string {
  return KNOWLEDGE_BASE_STATUS_LABELS[status];
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

const KNOWLEDGE_ITEM_CATEGORY_LABELS: Record<KnowledgeItemCategory, string> = {
  DOMAIN_RULE: "組織・領域固有のルール",
  EXAMPLE: "Good/Bad Example",
  FEEDBACK_POLICY: "教育的フィードバック方針",
  GUIDELINE_REF: "外部ガイドライン参照",
  SAFETY: "Safety",
  SOAP_RULE: "SOAPルール",
};

export function knowledgeItemCategoryLabel(
  category: KnowledgeItemCategory,
): string {
  return KNOWLEDGE_ITEM_CATEGORY_LABELS[category];
}

export type SoapKnowledgeBase = {
  id: string;
  code: string;
  name: string;
  description?: string;
  version: string;
  status: KnowledgeBaseStatus;
  createdAt: string;
};

export type SoapKnowledgeItem = {
  id: string;
  knowledgeBaseId: string;
  category: KnowledgeItemCategory;
  itemKey: string;
  title: string;
  content: string;
  isActive: boolean;
};
