/**
 * issue #8 の Acceptance Criteria「権限のない利用者はコメント・教材候補を参照できない」を
 * dummy データ段階で確認できるようにするための、demo 用ロール切り替え。実際の認可は
 * Cognito Group 由来の role（BFF 側で未実装）に置き換える想定で、ここは画面の見た目だけを
 * 制御する（DB・API のアクセス制御ではない）。
 *
 * 承認者ロールの範囲は issue #8 の Open Question のため、reviewer/admin に限定する運用は
 * 暫定であり、結論が出たら {@link canDecideCandidateStatus} だけを変更すればよい。
 */
export const KNOWLEDGE_REVIEW_ROLES = [
  "nurse",
  "reviewer",
  "admin",
  "trainee",
  "guest",
] as const;

export type KnowledgeReviewRole = (typeof KNOWLEDGE_REVIEW_ROLES)[number];

const ROLE_LABELS: Record<KnowledgeReviewRole, string> = {
  nurse: "専門職",
  reviewer: "レビュー承認者",
  admin: "管理者",
  trainee: "新人保健師",
  guest: "未選択",
};

export function knowledgeReviewRoleLabel(role: KnowledgeReviewRole): string {
  return ROLE_LABELS[role];
}

/** Knowledge Review 画面（コメント・教材候補）を参照できるロールか。 */
export function canViewKnowledgeReview(role: KnowledgeReviewRole): boolean {
  return role === "nurse" || role === "reviewer" || role === "admin";
}

/** コメントを投稿できるロールか（参照できるロールと同じ）。 */
export function canPostComment(role: KnowledgeReviewRole): boolean {
  return canViewKnowledgeReview(role);
}

/** 教材候補の状態（承認/却下/要修正）を変更できるロールか。 */
export function canDecideCandidateStatus(role: KnowledgeReviewRole): boolean {
  return role === "reviewer" || role === "admin";
}
