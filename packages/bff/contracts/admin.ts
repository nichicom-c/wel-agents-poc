import type { SoapCategory, SoapRecordType } from "./soap-records.ts";

/**
 * 管理画面（issue #10。`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md`
 * 参照）が使う教材 / 評価ルーブリック / 参照知識 / SOAP マッピング / 必須推奨項目 / 品質指標の
 * contract。DB スキーマは `terraform/aws/bff/migrations/0001_init.sql` に対応する。
 */

// --- 教材（materials / material_revisions） ---------------------------------

export const MATERIAL_TYPES = [
  "teaching_case",
  "comment_derived_note",
  "reference_summary",
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

export function isMaterialType(value: unknown): value is MaterialType {
  return (
    typeof value === "string" &&
    (MATERIAL_TYPES as readonly string[]).includes(value)
  );
}

export const PUBLICATION_STATUSES = [
  "draft",
  "reviewing",
  "published",
  "archived",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export function isPublicationStatus(
  value: unknown,
): value is PublicationStatus {
  return (
    typeof value === "string" &&
    (PUBLICATION_STATUSES as readonly string[]).includes(value)
  );
}

export type MaterialRevision = {
  fromStatus: PublicationStatus | null;
  toStatus: PublicationStatus;
  changedBy: string;
  changedAt: string;
};

export type Material = {
  id: string;
  materialType: MaterialType;
  title: string;
  publicationStatus: PublicationStatus;
  specialtyId?: string;
  learningThemeId?: string;
  difficultyId?: string;
  createdBy: string;
  createdAt: string;
  revisions: MaterialRevision[];
};

export type MaterialFilters = {
  materialType?: MaterialType;
  publicationStatus?: PublicationStatus;
};

// --- 評価ルーブリック ---------------------------------------------------------
//
// 保健師SOAP_KB_詳細設計書_v2 の rubric / rubric_level（8軸×4レベル）へ移行済み。
// 型定義は `./rubric.ts` を参照。

// --- 参照知識（reference_knowledge、read-only） ------------------------------

export const REFERENCE_KNOWLEDGE_SOURCE_TYPES = [
  "law",
  "medical_care_law",
  "internal_note",
] as const;

export type ReferenceKnowledgeSourceType =
  (typeof REFERENCE_KNOWLEDGE_SOURCE_TYPES)[number];

export type ReferenceKnowledge = {
  id: string;
  title: string;
  summary: string;
  sourceType: ReferenceKnowledgeSourceType;
  externalKbRef?: string;
  linkedMaterialIds: string[];
  linkedRubricIds: string[];
};

// --- SOAP マッピング（soap_mapping_versions） --------------------------------

export const MAPPING_CATEGORIES = [
  "S",
  "O",
  "A",
  "P",
] as const satisfies readonly SoapCategory[];

export type MappingCategory = (typeof MAPPING_CATEGORIES)[number];

export type MappingDefinition = Record<MappingCategory, string>;

export type SoapMappingVersion = {
  id: string;
  recordType: SoapRecordType;
  versionNo: number;
  mappingDefinition: MappingDefinition;
  isCurrent: boolean;
  effectiveFrom: string;
  createdBy: string;
};

// --- 必須・推奨項目（required_recommended_items） ----------------------------

export const REQUIREMENT_LEVELS = ["required", "recommended"] as const;

export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

export function isRequirementLevel(value: unknown): value is RequirementLevel {
  return (
    typeof value === "string" &&
    (REQUIREMENT_LEVELS as readonly string[]).includes(value)
  );
}

export type RequiredRecommendedItem = {
  id: string;
  recordType: SoapRecordType;
  specialtyId?: string;
  itemName: string;
  requirementLevel: RequirementLevel;
  aggregationCategory: string;
};

export type RequiredItemFilters = {
  recordType?: SoapRecordType;
  specialtyId?: string;
};

// --- 品質指標（quality_metrics_definitions、read-only） -----------------------

export type QualityMetricDefinition = {
  metricKey: string;
  displayName: string;
  calculationDescription: string;
  targetEntity: string;
};
