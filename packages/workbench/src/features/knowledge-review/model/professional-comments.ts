import type { SoapCategory } from "../../soap-draft/index.ts";
import { createId } from "./create-id.ts";

/** issue #8 の Technical Approach が定義するコメント種別。 */
export const COMMENT_TYPES = [
  "review",
  "correction_rationale",
  "instruction_note",
  "case_study",
] as const;

export type CommentType = (typeof COMMENT_TYPES)[number];

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
 * 「対象記録、記録版、投稿者、投稿時刻と関連づけられる」に対応する。
 */
export type ProfessionalComment = {
  id: string;
  targetRecordId: string;
  targetRecordVersionId: string;
  soapCategory?: SoapCategory;
  commentType: CommentType;
  /** 思考経路を含む自由記述。 */
  body: string;
  authorName: string;
  /** 投稿時点のロールのスナップショット（後からロールが変わっても意味が変わらないようにする）。 */
  authorRole: string;
  createdAt: string;
};

export type NewProfessionalCommentInput = Omit<
  ProfessionalComment,
  "id" | "createdAt"
>;

export function createComment(
  input: NewProfessionalCommentInput,
): ProfessionalComment {
  return {
    ...input,
    createdAt: new Date().toISOString(),
    id: createId("comment"),
  };
}

export function filterCommentsByVersion(
  comments: readonly ProfessionalComment[],
  targetRecordVersionId: string,
): ProfessionalComment[] {
  return comments.filter(
    (comment) => comment.targetRecordVersionId === targetRecordVersionId,
  );
}
