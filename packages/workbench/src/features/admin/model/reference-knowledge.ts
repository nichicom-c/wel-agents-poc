export const REFERENCE_KNOWLEDGE_SOURCE_TYPES = [
  "law",
  "medical_care_law",
  "internal_note",
] as const;

export type ReferenceKnowledgeSourceType =
  (typeof REFERENCE_KNOWLEDGE_SOURCE_TYPES)[number];

const SOURCE_TYPE_LABELS: Record<ReferenceKnowledgeSourceType, string> = {
  internal_note: "内部メモ",
  law: "法令（児童虐待防止法 等）",
  medical_care_law: "保険診療基本法令",
};

export function referenceKnowledgeSourceTypeLabel(
  sourceType: ReferenceKnowledgeSourceType,
): string {
  return SOURCE_TYPE_LABELS[sourceType];
}

/**
 * `externalKbRef` は既存の vector Knowledge Base（law / medical_care_law）上のドキュメントへの
 * 参照であり、内容をこのテーブルへ複製しない（`docs/notes/2026-07-30-...` の設計方針）。BFF
 * `/api/reference-knowledge` から取得する（作成/更新 UI はまだ無い。issue #10 の Out of Scope）。
 */
export type ReferenceKnowledge = {
  id: string;
  title: string;
  summary: string;
  sourceType: ReferenceKnowledgeSourceType;
  externalKbRef?: string;
  linkedMaterialIds: string[];
  linkedRubricIds: string[];
};
