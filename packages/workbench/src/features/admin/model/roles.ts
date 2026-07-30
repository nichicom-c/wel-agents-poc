/**
 * issue #10 の Acceptance Criteria は「管理者」ロールを前提にしている。dummy データ段階で
 * 権限の出し分けを確認できるようにするための demo 用ロール切り替え（`knowledge-review` の
 * roles.ts と同じ方針。実際の認可は Cognito Group 由来の role に置き換える想定）。
 *
 * 管理者ロールの範囲（教材管理者/ルーブリック管理者のように細分化するか）は issue #10 の
 * Open Question のため、ここでは単一の "admin" だけを許可する暫定実装にする。
 */
export const ADMIN_DEMO_ROLES = [
  "admin",
  "nurse",
  "reviewer",
  "trainee",
  "guest",
] as const;

export type AdminDemoRole = (typeof ADMIN_DEMO_ROLES)[number];

const ROLE_LABELS: Record<AdminDemoRole, string> = {
  admin: "管理者",
  guest: "未選択",
  nurse: "専門職",
  reviewer: "レビュー承認者",
  trainee: "新人保健師",
};

export function adminDemoRoleLabel(role: AdminDemoRole): string {
  return ROLE_LABELS[role];
}

/** 管理画面（教材・ルーブリック・参照知識・SOAP マッピング等）を参照できるロールか。 */
export function canViewAdmin(role: AdminDemoRole): boolean {
  return role === "admin";
}
