import { createId } from "./create-id.ts";

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

export type ExerciseAttempt = {
  id: string;
  exerciseCaseId: string;
  traineeName: string;
  status: ExerciseAttemptStatus;
  answers: ExerciseAttemptAnswers;
  /** クリックして開示した追加質問の id（回答内容とは別に、どこまで確認したかの記録）。 */
  revealedFollowupQuestionIds: string[];
  startedAt: string;
  submittedAt?: string;
};

export type NewExerciseAttemptInput = {
  exerciseCaseId: string;
  traineeName: string;
};

export function startExerciseAttempt(
  attempts: readonly ExerciseAttempt[],
  input: NewExerciseAttemptInput,
): ExerciseAttempt[] {
  const created: ExerciseAttempt = {
    answers: {
      additionalConfirmationText: "",
      assessmentText: "",
      soapText: "",
      supportPlanText: "",
    },
    exerciseCaseId: input.exerciseCaseId,
    id: createId("attempt"),
    revealedFollowupQuestionIds: [],
    startedAt: new Date().toISOString(),
    status: "in_progress",
    traineeName: input.traineeName,
  };
  return [...attempts, created];
}

export function revealFollowupQuestion(
  attempts: readonly ExerciseAttempt[],
  attemptId: string,
  questionId: string,
): ExerciseAttempt[] {
  return attempts.map((attempt) =>
    attempt.id === attemptId
      ? {
          ...attempt,
          revealedFollowupQuestionIds:
            attempt.revealedFollowupQuestionIds.includes(questionId)
              ? attempt.revealedFollowupQuestionIds
              : [...attempt.revealedFollowupQuestionIds, questionId],
        }
      : attempt,
  );
}

export function withDraftAnswers(
  attempts: readonly ExerciseAttempt[],
  attemptId: string,
  answers: ExerciseAttemptAnswers,
): ExerciseAttempt[] {
  return attempts.map((attempt) =>
    attempt.id === attemptId ? { ...attempt, answers } : attempt,
  );
}

export function submitExerciseAttempt(
  attempts: readonly ExerciseAttempt[],
  attemptId: string,
): ExerciseAttempt[] {
  return attempts.map((attempt) =>
    attempt.id === attemptId
      ? {
          ...attempt,
          status: "submitted",
          submittedAt: new Date().toISOString(),
        }
      : attempt,
  );
}

export function attemptsForTrainee(
  attempts: readonly ExerciseAttempt[],
  traineeName: string,
): ExerciseAttempt[] {
  return attempts.filter((attempt) => attempt.traineeName === traineeName);
}
