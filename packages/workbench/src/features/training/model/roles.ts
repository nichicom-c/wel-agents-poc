/**
 * dummy データ段階で権限の出し分けを確認できるようにするための demo 用ロール切り替え
 * （`knowledge-review` / `admin` の roles.ts と同じ方針）。
 *
 * ロール権限の詳細は未確定のため、ここでは「Training 画面（教材チャット）を参照できるのは
 * trainee/instructor/admin だけ」という最小限の区分だけを暫定実装する。
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

/** Training 画面（教材チャット）自体を参照できるロールか。 */
export function canViewTraining(role: TrainingDemoRole): boolean {
  return role === "trainee" || role === "instructor" || role === "admin";
}
