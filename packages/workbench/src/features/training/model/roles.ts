/**
 * issue #9 の Acceptance Criteria は「新人保健師」「指導者」の2ロールを前提にしている。
 * dummy データ段階で権限の出し分けを確認できるようにするための demo 用ロール切り替え
 * （`knowledge-review` / `admin` の roles.ts と同じ方針）。
 *
 * 受講者ロールと指導者ロールの権限の詳細は issue #9 の Open Question のため、ここでは
 * 「演習に回答できるのは trainee だけ」「指導者ビューを見られるのは instructor/admin だけ」
 * という最小限の区分だけを暫定実装する。
 */
export const TRAINING_DEMO_ROLES = [
  "trainee",
  "instructor",
  "admin",
  "nurse",
  "reviewer",
  "guest",
] as const;

export type TrainingDemoRole = (typeof TRAINING_DEMO_ROLES)[number];

const ROLE_LABELS: Record<TrainingDemoRole, string> = {
  admin: "管理者",
  guest: "未選択",
  instructor: "指導者",
  nurse: "専門職",
  reviewer: "レビュー承認者",
  trainee: "新人保健師",
};

export function trainingDemoRoleLabel(role: TrainingDemoRole): string {
  return ROLE_LABELS[role];
}

/** Training 画面（演習・指導者ビュー）自体を参照できるロールか。 */
export function canViewTraining(role: TrainingDemoRole): boolean {
  return role === "trainee" || role === "instructor" || role === "admin";
}

/** 演習ケースに回答できるロールか。 */
export function canAttemptExercise(role: TrainingDemoRole): boolean {
  return role === "trainee";
}

/** 提出済み回答の指導者ビュー（レビュー・指導者コメント追加）を見られるロールか。 */
export function canReviewAsInstructor(role: TrainingDemoRole): boolean {
  return role === "instructor" || role === "admin";
}
