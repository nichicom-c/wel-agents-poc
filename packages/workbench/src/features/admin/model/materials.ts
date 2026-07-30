/** issue #8 由来の教材候補（承認済み）が採る形。教材の種類は暫定の3種類。 */
export const MATERIAL_TYPES = [
  "teaching_case",
  "comment_derived_note",
  "reference_summary",
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  comment_derived_note: "コメント由来のノート",
  reference_summary: "参照知識のまとめ",
  teaching_case: "演習ケース素材",
};

export function materialTypeLabel(materialType: MaterialType): string {
  return MATERIAL_TYPE_LABELS[materialType];
}

/** issue #10 の Acceptance Criteria が定義する教材の公開状態。 */
export const PUBLICATION_STATUSES = [
  "draft",
  "reviewing",
  "published",
  "archived",
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  archived: "アーカイブ済み",
  draft: "下書き",
  published: "公開済み",
  reviewing: "レビュー中",
};

export function publicationStatusLabel(status: PublicationStatus): string {
  return PUBLICATION_STATUS_LABELS[status];
}

export type MaterialRevision = {
  fromStatus: PublicationStatus | null;
  toStatus: PublicationStatus;
  changedBy: string;
  changedAt: string;
};

/**
 * 教材。BFF `/api/materials`（Aurora Serverless v2 + RDS Data API）から取得する
 * （`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）。
 */
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
