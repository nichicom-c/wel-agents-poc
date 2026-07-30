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
};

export type MaterialCandidateFilters = {
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  status?: MaterialCandidateStatus;
};
