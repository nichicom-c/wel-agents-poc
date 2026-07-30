import { createId } from "./create-id.ts";

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
  description: string;
};

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

/**
 * 有識者確認前 ⇄ 確認済みの遷移。「未確定を確認済みとして扱わない」ことが issue #10 の
 * Acceptance Criteria の主眼だが、dummy データの demo では入力ミスの取り消しも試せるよう
 * 双方向の遷移を許す（本番では確認済みへの一方向遷移＋承認フローに絞る想定。issue #10 の
 * Open Question「ルーブリック確定時の承認フロー」）。
 */
export function setRubricReviewStatus(
  rubrics: readonly Rubric[],
  id: string,
  nextStatus: RubricReviewStatus,
): Rubric[] {
  return rubrics.map((rubric) =>
    rubric.id === id ? { ...rubric, reviewStatus: nextStatus } : rubric,
  );
}

export type NewRubricInput = {
  name: string;
  targetType: RubricTargetType;
  createdBy: string;
};

export function createRubric(
  rubrics: readonly Rubric[],
  input: NewRubricInput,
): Rubric[] {
  const created: Rubric = {
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    id: createId("rubric"),
    items: [],
    name: input.name,
    reviewStatus: "expert_review_required",
    targetType: input.targetType,
    versionNo: 1,
  };
  return [...rubrics, created];
}
