import type { SoapRecordType } from "../../soap-draft/index.ts";
import { createId } from "./create-id.ts";

/** issue #8 の Acceptance Criteria が定義する教材候補の状態。 */
export const MATERIAL_CANDIDATE_STATUSES = [
  "candidate",
  "approved",
  "rejected",
  "needs_revision",
] as const;

export type MaterialCandidateStatus =
  (typeof MATERIAL_CANDIDATE_STATUSES)[number];

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
  reasonCode?: RejectionReasonCode;
  reasonText?: string;
  changedAt: string;
};

export type MaterialCandidate = {
  id: string;
  title: string;
  summary: string;
  status: MaterialCandidateStatus;
  specialtyId: string;
  recordType: SoapRecordType;
  learningThemeId: string;
  difficultyId: string;
  /** 教材候補化の元になった専門職コメント（1件以上、複数コメントを束ねられる）。 */
  commentIds: string[];
  rejectionReasonCode?: RejectionReasonCode;
  createdBy: string;
  createdAt: string;
  statusHistory: MaterialCandidateStatusEvent[];
};

export type MaterialCandidateFilters = {
  specialtyId?: string;
  recordType?: SoapRecordType;
  learningThemeId?: string;
  difficultyId?: string;
  status?: MaterialCandidateStatus;
};

/** 分野・記録種別・学習テーマ・難易度・状態で検索する（issue #8 の Acceptance Criteria）。 */
export function filterMaterialCandidates(
  candidates: readonly MaterialCandidate[],
  filters: MaterialCandidateFilters,
): MaterialCandidate[] {
  return candidates.filter(
    (candidate) =>
      (!filters.specialtyId || candidate.specialtyId === filters.specialtyId) &&
      (!filters.recordType || candidate.recordType === filters.recordType) &&
      (!filters.learningThemeId ||
        candidate.learningThemeId === filters.learningThemeId) &&
      (!filters.difficultyId ||
        candidate.difficultyId === filters.difficultyId) &&
      (!filters.status || candidate.status === filters.status),
  );
}

export type DecideMaterialCandidateStatusOptions = {
  reasonCode?: RejectionReasonCode;
  reasonText?: string;
};

/** 承認/却下/要修正の状態遷移を記録し、`statusHistory` に承認 gate の経緯を積む。 */
export function decideMaterialCandidateStatus(
  candidates: readonly MaterialCandidate[],
  id: string,
  nextStatus: MaterialCandidateStatus,
  changedBy: string,
  options: DecideMaterialCandidateStatusOptions = {},
): MaterialCandidate[] {
  return candidates.map((candidate) => {
    if (candidate.id !== id) {
      return candidate;
    }
    const event: MaterialCandidateStatusEvent = {
      changedAt: new Date().toISOString(),
      changedBy,
      fromStatus: candidate.status,
      reasonCode: options.reasonCode,
      reasonText: options.reasonText,
      toStatus: nextStatus,
    };
    return {
      ...candidate,
      rejectionReasonCode:
        nextStatus === "rejected"
          ? options.reasonCode
          : candidate.rejectionReasonCode,
      status: nextStatus,
      statusHistory: [...candidate.statusHistory, event],
    };
  });
}

export type NewMaterialCandidateInput = {
  title: string;
  summary: string;
  specialtyId: string;
  recordType: SoapRecordType;
  learningThemeId: string;
  difficultyId: string;
  commentIds: string[];
  createdBy: string;
};

/** 選択した専門職コメントを束ねて新しい教材候補（status: candidate）を作る。 */
export function createMaterialCandidateFromComments(
  candidates: readonly MaterialCandidate[],
  input: NewMaterialCandidateInput,
): MaterialCandidate[] {
  const createdAt = new Date().toISOString();
  const created: MaterialCandidate = {
    commentIds: input.commentIds,
    createdAt,
    createdBy: input.createdBy,
    difficultyId: input.difficultyId,
    id: createId("candidate"),
    learningThemeId: input.learningThemeId,
    recordType: input.recordType,
    specialtyId: input.specialtyId,
    status: "candidate",
    statusHistory: [
      {
        changedAt: createdAt,
        changedBy: input.createdBy,
        fromStatus: null,
        toStatus: "candidate",
      },
    ],
    summary: input.summary,
    title: input.title,
  };
  return [...candidates, created];
}
