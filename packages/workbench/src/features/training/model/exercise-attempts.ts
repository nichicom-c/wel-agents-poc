import type { ExerciseCase } from "./exercise-cases.ts";
import type { ExerciseFeedback } from "./exercise-feedback.ts";

export const EXERCISE_ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "feedback_ready",
] as const;

export type ExerciseAttemptStatus = (typeof EXERCISE_ATTEMPT_STATUSES)[number];

const ATTEMPT_STATUS_LABELS: Record<ExerciseAttemptStatus, string> = {
  feedback_ready: "フィードバック済み",
  in_progress: "回答中",
  submitted: "提出済み",
};

export function exerciseAttemptStatusLabel(
  status: ExerciseAttemptStatus,
): string {
  return ATTEMPT_STATUS_LABELS[status];
}

export type ExerciseAttemptAnswers = {
  /** SOAP（情報収集）の記載。 */
  soapText: string;
  /** 追加確認事項として挙げた内容。 */
  additionalConfirmationText: string;
  assessmentText: string;
  supportPlanText: string;
};

/**
 * 演習の受講記録。BFF `/api/exercise-attempts`（Aurora Serverless v2 + RDS Data API）から
 * 取得する。`exerciseCase` / `feedback` は一覧取得時に埋め込まれるため、詳細表示に追加
 * fetch は不要。
 */
export type ExerciseAttempt = {
  id: string;
  exerciseCase: ExerciseCase;
  traineeId: string;
  traineeName: string;
  status: ExerciseAttemptStatus;
  answers: ExerciseAttemptAnswers;
  /** クリックして開示した追加質問の id（回答内容とは別に、どこまで確認したかの記録）。 */
  revealedFollowupQuestionIds: string[];
  startedAt: string;
  submittedAt?: string;
  feedback?: ExerciseFeedback;
};
