import type { SoapRecordType } from "../../soap-draft/index.ts";
import type { ProfessionalComment } from "./professional-comments.ts";

/** issue #8 の Acceptance Criteria が定義する教材候補の状態。 */
export const MATERIAL_CANDIDATE_STATUSES = [
  "candidate",
  "approved",
  "rejected",
  "needs_revision",
] as const;

export type MaterialCandidateStatus =
  (typeof MATERIAL_CANDIDATE_STATUSES)[number];

export function isMaterialCandidateStatus(
  value: unknown,
): value is MaterialCandidateStatus {
  return (
    typeof value === "string" &&
    (MATERIAL_CANDIDATE_STATUSES as readonly string[]).includes(value)
  );
}

const STATUS_LABELS: Record<MaterialCandidateStatus, string> = {
  candidate: "候補",
  approved: "承認済み",
  rejected: "却下",
  needs_revision: "要修正",
};

export function materialCandidateStatusLabel(
  status: MaterialCandidateStatus,
): string {
  return STATUS_LABELS[status];
}

/**
 * 却下理由の分類は issue #8 の Open Question のため暫定コード。issue #10 でマスタ管理する
 * 想定で、結論が出たらこの配列を差し替えるだけで済むようにする。
 */
export const REJECTION_REASON_CODES = [
  "insufficient_generality",
  "personal_identifiable_info",
  "duplicate_content",
  "unclear_rationale",
  "other",
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];

export function isRejectionReasonCode(
  value: unknown,
): value is RejectionReasonCode {
  return (
    typeof value === "string" &&
    (REJECTION_REASON_CODES as readonly string[]).includes(value)
  );
}

const REJECTION_REASON_LABELS: Record<RejectionReasonCode, string> = {
  insufficient_generality: "汎用性が低い",
  personal_identifiable_info: "個人が特定できる情報を含む",
  duplicate_content: "既存教材と重複",
  unclear_rationale: "判断根拠が不明確",
  other: "その他",
};

export function rejectionReasonLabel(code: RejectionReasonCode): string {
  return REJECTION_REASON_LABELS[code];
}

export type MaterialCandidateStatusEvent = {
  fromStatus: MaterialCandidateStatus | null;
  toStatus: MaterialCandidateStatus;
  changedBy: string;
  changedByRole: string;
  reasonText?: string;
  changedAt: string;
};

/**
 * 教材候補。BFF `/api/material-candidates`（Aurora Serverless v2 + RDS Data API）から取得する
 * （`docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）。紐づく専門職
 * コメントと状態履歴は一覧取得時に埋め込まれるため、「詳細」展開に追加 fetch は不要。
 */
export type MaterialCandidate = {
  id: string;
  title: string;
  summary: string;
  status: MaterialCandidateStatus;
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  /** 教材候補化の元になった専門職コメント（1件以上、複数コメントを束ねられる）。 */
  comments: ProfessionalComment[];
  rejectionReasonCode?: RejectionReasonCode;
  createdBy: string;
  createdAt: string;
  statusHistory: MaterialCandidateStatusEvent[];
  /** `materials.id`。教材化済み（issue #10 の教材へ変換済み）の場合だけ設定される。 */
  materialId?: string;
};

export type MaterialCandidateFilters = {
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  status?: MaterialCandidateStatus;
};
