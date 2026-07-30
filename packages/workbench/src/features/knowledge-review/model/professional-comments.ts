import type { SoapCategory } from "../../soap-draft/index.ts";

/** issue #8 の Technical Approach が定義するコメント種別。 */
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

const COMMENT_TYPE_LABELS: Record<CommentType, string> = {
  review: "レビュー",
  correction_rationale: "訂正理由",
  instruction_note: "指導メモ",
  case_study: "ケース学習",
};

export function commentTypeLabel(commentType: CommentType): string {
  return COMMENT_TYPE_LABELS[commentType];
}

/**
 * 専門職コメント。`targetRecordVersionId` で正式記録の特定版に、`soapCategory` で
 * （分かる場合は）版の中の S/O/A/P 項目まで対象を絞る。issue #8 の Acceptance Criteria
 * 「対象記録、記録版、投稿者、投稿時刻と関連づけられる」に対応する。BFF
 * `/api/professional-comments`（Aurora Serverless v2 + RDS Data API）から取得する
 * （`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）。
 */
export type ProfessionalComment = {
  id: string;
  targetRecordId: string;
  targetRecordVersionId: string;
  soapCategory?: SoapCategory;
  commentType: CommentType;
  /** 思考経路を含む自由記述。 */
  body: string;
  authorId: string;
  /** 表示名（無ければ `authorRoleAtPost` にフォールバック、BFF 側で解決済み）。 */
  authorName: string;
  /**
   * 投稿時点のロールのスナップショット（自由記述）。承認者ロールの範囲は issue #8 の
   * Open Question のため、実際の RBAC ではなく投稿者が選んだ値をそのまま記録する。
   */
  authorRoleAtPost: string;
  createdAt: string;
};
