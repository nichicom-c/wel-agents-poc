import type { SoapCategory } from "./soap-records.ts";

/**
 * 専門職コメント（issue #8）の contract。DB スキーマは
 * `terraform/aws/bff/migrations/0001_init.sql` の `professional_comments` に対応する。
 */

export const COMMENT_TYPES = [
  "review",
  "correction_rationale",
  "instruction_note",
  "case_study",
] as const;

export type CommentType = (typeof COMMENT_TYPES)[number];

export function isCommentType(value: unknown): value is CommentType {
  return (
    typeof value === "string" &&
    (COMMENT_TYPES as readonly string[]).includes(value)
  );
}

export type ProfessionalComment = {
  id: string;
  targetRecordId: string;
  targetRecordVersionId: string;
  soapCategory?: SoapCategory;
  commentType: CommentType;
  body: string;
  authorId: string;
  /** `app_users.display_name` があれば使い、無ければ `authorRoleAtPost` にフォールバックする。 */
  authorName: string;
  /**
   * 投稿時点のロールのスナップショット（自由記述）。承認者ロールの範囲は issue #8 の
   * Open Question のため、実際の RBAC ではなく投稿者が選んだ値をそのまま記録する。
   */
  authorRoleAtPost: string;
  createdAt: string;
};
