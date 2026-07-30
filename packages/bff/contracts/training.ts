/**
 * 新人保健師向け演習（issue #9。
 * `docs/notes/2026-07-30-training-materials-db-schema-and-aws-infra.md` 参照）の contract。
 * DB スキーマは `terraform/aws/bff/migrations/0001_init.sql` の `exercise_cases` 以下、
 * および issue #10 の `materials`（`material_type: teaching_case` の 1:1 拡張）に対応する。
 */

export const EXERCISE_ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "feedback_ready",
] as const;

export type ExerciseAttemptStatus = (typeof EXERCISE_ATTEMPT_STATUSES)[number];

export function isExerciseAttemptStatus(
  value: unknown,
): value is ExerciseAttemptStatus {
  return (
    typeof value === "string" &&
    (EXERCISE_ATTEMPT_STATUSES as readonly string[]).includes(value)
  );
}

export const MODEL_ANSWER_TYPES = [
  "soap",
  "assessment",
  "support_plan",
] as const;

export type ModelAnswerType = (typeof MODEL_ANSWER_TYPES)[number];

export function isModelAnswerType(value: unknown): value is ModelAnswerType {
  return (
    typeof value === "string" &&
    (MODEL_ANSWER_TYPES as readonly string[]).includes(value)
  );
}

export type ExerciseFollowupQuestion = {
  id: string;
  questionText: string;
  revealedInfoText: string;
};

export type ExerciseModelAnswer = {
  id: string;
  answerType: ModelAnswerType;
  content: string;
  acceptableNote?: string;
};

/** issue #10 の `materials`（`material_type: teaching_case`）の1:1拡張。 */
export type ExerciseCase = {
  id: string;
  title: string;
  specialtyId?: string;
  learningThemeId?: string;
  difficultyId?: string;
  initialPresentation: string;
  expectedWorkScene?: string;
  constraintsText?: string;
  requiredInstitutionalKnowledge?: string;
  /** issue #10 のルーブリック（`exercise_case_rubrics` 経由）から集めた評価観点。 */
  evaluationCriteria: string[];
  followupQuestions: ExerciseFollowupQuestion[];
  modelAnswers: ExerciseModelAnswer[];
};

export type ExerciseCaseFilters = {
  specialtyId?: string;
  difficultyId?: string;
  learningThemeId?: string;
};

export type ExerciseInstructorComment = {
  id: string;
  instructorId: string;
  instructorName: string;
  body: string;
  createdAt: string;
};

export type ExerciseFeedbackGeneratedBy = "ai" | "instructor";

export type ExerciseFeedback = {
  id: string;
  attemptId: string;
  generatedBy: ExerciseFeedbackGeneratedBy;
  dataCollectionNote: string;
  rationaleNote: string;
  assessmentNote: string;
  supportPlanNote: string;
  documentationNote: string;
  createdAt: string;
  instructorComments: ExerciseInstructorComment[];
};

export type ExerciseAttemptAnswers = {
  soapText: string;
  additionalConfirmationText: string;
  assessmentText: string;
  supportPlanText: string;
};

/** `exerciseCase` を1回の select に埋め込むため、記録の一覧・詳細どちらも追加 fetch が不要。 */
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
