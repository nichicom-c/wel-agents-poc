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
 * 却下理由は `rejection_reason_codes` マスタの `code`。選択肢とラベルは BFF `/api/masters`
 * から取得する（`features/masters`）ため、ここでは union に固定しない。
 */
export type RejectionReasonCode = string;

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
  /**
   * この教材候補で新人が身につけるべき学習目標（任意）。BFF の教材候補生成 agent
   * （AgentCore `type: "teaching_material"`）が専門職コメントから生成する。
   */
  learningObjective?: string;
  /** 指導のポイント（教えるべきこと）の一覧（任意）。`learningObjective` と同じ生成元。 */
  teachingPoints?: string[];
};

export type MaterialCandidateFilters = {
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  status?: MaterialCandidateStatus;
};
