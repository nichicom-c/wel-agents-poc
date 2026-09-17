/**
 * 管理画面（issue #10。`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md`
 * 参照）が使う教材 / 評価ルーブリックの contract。DB スキーマは
 * `terraform/aws/bff/migrations/0001_init.sql` に対応する。
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
  /**
   * この教材で新人が身につけるべき学習目標（任意）。教材候補の承認・教材化（issue #8）で
   * 引き継がれるか、Admin 画面の新規登録フォームで直接入力される。Training 画面の
   * 教材チャットが会話の初期文脈として使う。
   */
  learningObjective?: string;
  /** 指導のポイント(教えるべきこと)の一覧（任意）。`learningObjective` と同じ生成元。 */
  teachingPoints?: string[];
};

export type MaterialFilters = {
  materialType?: MaterialType;
  publicationStatus?: PublicationStatus;
};

// --- 評価ルーブリック ---------------------------------------------------------
//
// 保健師SOAP_KB_詳細設計書_v2 の rubric / rubric_level（8軸×4レベル）へ移行済み。
// 型定義は `./rubric.ts` を参照。
