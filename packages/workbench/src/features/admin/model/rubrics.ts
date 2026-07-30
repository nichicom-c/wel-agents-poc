/** issue #10 の Acceptance Criteria が定義するルーブリックの確認状態。 */
export const RUBRIC_REVIEW_STATUSES = [
  "expert_review_required",
  "confirmed",
] as const;

export type RubricReviewStatus = (typeof RUBRIC_REVIEW_STATUSES)[number];

const RUBRIC_REVIEW_STATUS_LABELS: Record<RubricReviewStatus, string> = {
  confirmed: "確認済み",
  expert_review_required: "有識者確認前",
};

export function rubricReviewStatusLabel(status: RubricReviewStatus): string {
  return RUBRIC_REVIEW_STATUS_LABELS[status];
}

export const RUBRIC_TARGET_TYPES = [
  "exercise_feedback",
  "material_review",
] as const;

export type RubricTargetType = (typeof RUBRIC_TARGET_TYPES)[number];

const RUBRIC_TARGET_TYPE_LABELS: Record<RubricTargetType, string> = {
  exercise_feedback: "演習フィードバック",
  material_review: "教材レビュー",
};

export function rubricTargetTypeLabel(targetType: RubricTargetType): string {
  return RUBRIC_TARGET_TYPE_LABELS[targetType];
}

export type RubricItem = {
  id: string;
  criterionName: string;
  description?: string;
};

/**
 * 評価ルーブリック。BFF `/api/rubrics`（Aurora Serverless v2 + RDS Data API）から取得する
 * （`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）。
 */
export type Rubric = {
  id: string;
  name: string;
  targetType: RubricTargetType;
  reviewStatus: RubricReviewStatus;
  versionNo: number;
  items: RubricItem[];
  createdBy: string;
  createdAt: string;
};
