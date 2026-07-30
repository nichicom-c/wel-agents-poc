import type { ProfessionalComment } from "./professional-comments.ts";
import type { SoapRecordType } from "./soap-records.ts";

/**
 * 教材候補（issue #8）の contract。DB スキーマは
 * `terraform/aws/bff/migrations/0001_init.sql` の `material_candidates` /
 * `material_candidate_comments` / `material_candidate_status_events` に対応する。
 */

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

export type MaterialCandidateStatusEvent = {
  fromStatus: MaterialCandidateStatus | null;
  toStatus: MaterialCandidateStatus;
  changedBy: string;
  changedByRole: string;
  reasonText?: string;
  changedAt: string;
};

export type MaterialCandidate = {
  id: string;
  title: string;
  summary: string;
  status: MaterialCandidateStatus;
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  rejectionReasonCode?: string;
  createdBy: string;
  createdAt: string;
  /** 教材候補化の元になった専門職コメント（1件以上、複数コメントを束ねられる）。 */
  comments: ProfessionalComment[];
  statusHistory: MaterialCandidateStatusEvent[];
  /** `materials.id`。教材化済み（issue #10 の `materials` へ変換済み）の場合だけ設定される。 */
  materialId?: string;
};

export type MaterialCandidateFilters = {
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  status?: MaterialCandidateStatus;
};

/**
 * `POST .../promote-to-material` で `status: approved` になっていない候補を教材化しようとした
 * 場合。infra と application の両方から instanceof で判定できるよう contracts に置く。
 */
export class MaterialCandidateNotApprovedError extends Error {
  override name = "MaterialCandidateNotApprovedError";
}

/** すでに `materialId` が設定済みの候補をもう一度教材化しようとした場合。 */
export class MaterialCandidateAlreadyPromotedError extends Error {
  override name = "MaterialCandidateAlreadyPromotedError";
}
