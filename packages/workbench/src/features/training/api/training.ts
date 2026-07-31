import {
  EXERCISE_ATTEMPT_STATUSES,
  type ExerciseAttempt,
  type ExerciseAttemptAnswers,
  type ExerciseAttemptStatus,
} from "../model/exercise-attempts.ts";
import {
  type ExerciseCase,
  type ExerciseCaseFilters,
  type ExerciseFollowupQuestion,
  type ExerciseModelAnswer,
  MODEL_ANSWER_TYPES,
  type ModelAnswerType,
} from "../model/exercise-cases.ts";
import type {
  ExerciseFeedback,
  ExerciseInstructorComment,
} from "../model/exercise-feedback.ts";

/**
 * 新人保健師向け演習（issue #9）が使う BFF `/api/exercise-cases` / `/api/exercise-attempts*` /
 * `/api/instructor-comments`（Aurora Serverless v2 + RDS Data API、フィードバック生成は
 * AgentCore の演習フィードバック agent）を呼ぶ。
 */

const EXERCISE_CASES_ENDPOINT = "/api/exercise-cases";
const EXERCISE_ATTEMPTS_ENDPOINT = "/api/exercise-attempts";
const INSTRUCTOR_COMMENTS_ENDPOINT = "/api/instructor-comments";

type FetchFn = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function listExerciseCases(
  filters: ExerciseCaseFilters = {},
  fetchFn: FetchFn = fetch,
): Promise<ExerciseCase[]> {
  const query = new URLSearchParams();
  if (filters.specialtyId) {
    query.set("specialtyId", filters.specialtyId);
  }
  if (filters.difficultyId) {
    query.set("difficultyId", filters.difficultyId);
  }
  if (filters.learningThemeId) {
    query.set("learningThemeId", filters.learningThemeId);
  }
  const queryString = query.toString();

  const response = await fetchFn(
    queryString
      ? `${EXERCISE_CASES_ENDPOINT}?${queryString}`
      : EXERCISE_CASES_ENDPOINT,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeExerciseCases(payload.cases);
}

export type NewExerciseCaseFollowupQuestionInput = {
  questionText: string;
  revealedInfoText: string;
};

export type NewExerciseCaseModelAnswerInput = {
  answerType: ModelAnswerType;
  content: string;
  acceptableNote?: string;
};

export type NewExerciseCaseInput = {
  /** 演習ケース化する教材（`material_type: teaching_case`）の id。 */
  materialId: string;
  initialPresentation: string;
  expectedWorkScene?: string;
  constraintsText?: string;
  requiredInstitutionalKnowledge?: string;
  followupQuestions?: NewExerciseCaseFollowupQuestionInput[];
  modelAnswers?: NewExerciseCaseModelAnswerInput[];
  /** 評価観点として紐づける既存ルーブリックの id。 */
  rubricIds?: string[];
};

/** 既存の教材（issue #10、`material_type: teaching_case`）から演習ケースを作る。 */
export async function createExerciseCase(
  input: NewExerciseCaseInput,
  fetchFn: FetchFn = fetch,
): Promise<ExerciseCase> {
  const response = await fetchFn(EXERCISE_CASES_ENDPOINT, {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const exerciseCase = normalizeExerciseCase(payload);
  if (!exerciseCase) {
    throw new Error("invalid response from /api/exercise-cases");
  }
  return exerciseCase;
}

export async function startAttempt(
  exerciseCaseId: string,
  fetchFn: FetchFn = fetch,
): Promise<ExerciseAttempt> {
  const response = await fetchFn(EXERCISE_ATTEMPTS_ENDPOINT, {
    body: JSON.stringify({ exerciseCaseId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return unwrapAttempt(response, "/api/exercise-attempts");
}

export async function revealFollowup(
  attemptId: string,
  questionId: string,
  fetchFn: FetchFn = fetch,
): Promise<ExerciseAttempt> {
  const response = await fetchFn(
    `${EXERCISE_ATTEMPTS_ENDPOINT}/${encodeURIComponent(attemptId)}/reveal-followup`,
    {
      body: JSON.stringify({ questionId }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  return unwrapAttempt(response, "/api/exercise-attempts/:id/reveal-followup");
}

export async function saveDraftAnswers(
  attemptId: string,
  answers: ExerciseAttemptAnswers,
  fetchFn: FetchFn = fetch,
): Promise<ExerciseAttempt> {
  const response = await fetchFn(
    `${EXERCISE_ATTEMPTS_ENDPOINT}/${encodeURIComponent(attemptId)}/draft-answers`,
    {
      body: JSON.stringify({ answers }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    },
  );
  return unwrapAttempt(response, "/api/exercise-attempts/:id/draft-answers");
}

/** 提出し、AgentCore の演習フィードバック agent が生成した5観点を埋め込んだ受講記録を返す。 */
export async function submitAttemptAndGenerateFeedback(
  attemptId: string,
  fetchFn: FetchFn = fetch,
): Promise<ExerciseAttempt> {
  const response = await fetchFn(
    `${EXERCISE_ATTEMPTS_ENDPOINT}/${encodeURIComponent(attemptId)}/submit`,
    { method: "POST" },
  );
  return unwrapAttempt(response, "/api/exercise-attempts/:id/submit");
}

export async function listAttemptsForTrainee(
  fetchFn: FetchFn = fetch,
): Promise<ExerciseAttempt[]> {
  const response = await fetchFn(`${EXERCISE_ATTEMPTS_ENDPOINT}?scope=mine`);
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeAttempts(payload.attempts);
}

export async function listInstructorQueue(
  fetchFn: FetchFn = fetch,
): Promise<ExerciseAttempt[]> {
  const response = await fetchFn(
    `${EXERCISE_ATTEMPTS_ENDPOINT}?scope=instructor-queue`,
  );
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  return normalizeAttempts(payload.attempts);
}

export async function postInstructorComment(
  feedbackId: string,
  body: string,
  fetchFn: FetchFn = fetch,
): Promise<ExerciseAttempt> {
  const response = await fetchFn(INSTRUCTOR_COMMENTS_ENDPOINT, {
    body: JSON.stringify({ body, feedbackId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return unwrapAttempt(response, "/api/instructor-comments");
}

// --- helpers --------------------------------------------------------------

async function unwrapAttempt(
  response: Response,
  endpointForError: string,
): Promise<ExerciseAttempt> {
  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(trimmedText(payload.error) || `HTTP ${response.status}`);
  }

  const attempt = normalizeAttempt(payload);
  if (!attempt) {
    throw new Error(`invalid response from ${endpointForError}`);
  }
  return attempt;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}));
  return asRecord(payload);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isOneOf<T extends string>(
  options: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (options as readonly string[]).includes(value)
  );
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeExerciseCases(value: unknown): ExerciseCase[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeExerciseCase(asRecord(entry)))
    .filter((item): item is ExerciseCase => item !== undefined);
}

function normalizeExerciseCase(
  record: Record<string, unknown>,
): ExerciseCase | undefined {
  const id = trimmedText(record.id);
  const title = trimmedText(record.title);
  const initialPresentation = trimmedText(record.initialPresentation);

  if (!id || !title || !initialPresentation) {
    return undefined;
  }

  return {
    constraintsText: trimmedText(record.constraintsText) || undefined,
    difficultyId: trimmedText(record.difficultyId) || undefined,
    evaluationCriteria: stringArray(record.evaluationCriteria),
    expectedWorkScene: trimmedText(record.expectedWorkScene) || undefined,
    followupQuestions: normalizeFollowupQuestions(record.followupQuestions),
    id,
    initialPresentation,
    learningThemeId: trimmedText(record.learningThemeId) || undefined,
    modelAnswers: normalizeModelAnswers(record.modelAnswers),
    requiredInstitutionalKnowledge:
      trimmedText(record.requiredInstitutionalKnowledge) || undefined,
    specialtyId: trimmedText(record.specialtyId) || undefined,
    title,
  };
}

function normalizeFollowupQuestions(
  value: unknown,
): ExerciseFollowupQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const id = trimmedText(record.id);
      const questionText = trimmedText(record.questionText);
      const revealedInfoText = trimmedText(record.revealedInfoText);
      if (!id || !questionText || !revealedInfoText) {
        return undefined;
      }
      return { id, questionText, revealedInfoText };
    })
    .filter((item): item is ExerciseFollowupQuestion => item !== undefined);
}

function normalizeModelAnswers(value: unknown): ExerciseModelAnswer[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): ExerciseModelAnswer | undefined => {
      const record = asRecord(entry);
      const id = trimmedText(record.id);
      const answerType = record.answerType;
      const content = trimmedText(record.content);
      if (!id || !isOneOf(MODEL_ANSWER_TYPES, answerType) || !content) {
        return undefined;
      }
      return {
        acceptableNote: trimmedText(record.acceptableNote) || undefined,
        answerType,
        content,
        id,
      };
    })
    .filter((item): item is ExerciseModelAnswer => item !== undefined);
}

function normalizeAttempts(value: unknown): ExerciseAttempt[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeAttempt(asRecord(entry)))
    .filter((item): item is ExerciseAttempt => item !== undefined);
}

function normalizeAttempt(
  record: Record<string, unknown>,
): ExerciseAttempt | undefined {
  const id = trimmedText(record.id);
  const status = record.status;
  const traineeId = trimmedText(record.traineeId);
  const traineeName = trimmedText(record.traineeName);
  const startedAt = trimmedText(record.startedAt);
  const exerciseCase = normalizeExerciseCase(asRecord(record.exerciseCase));

  if (
    !id ||
    !isOneOf(EXERCISE_ATTEMPT_STATUSES, status) ||
    !traineeId ||
    !traineeName ||
    !startedAt ||
    !exerciseCase
  ) {
    return undefined;
  }

  const answersRecord = asRecord(record.answers);

  return {
    answers: {
      additionalConfirmationText: trimmedText(
        answersRecord.additionalConfirmationText,
      ),
      assessmentText: trimmedText(answersRecord.assessmentText),
      soapText: trimmedText(answersRecord.soapText),
      supportPlanText: trimmedText(answersRecord.supportPlanText),
    },
    exerciseCase,
    feedback: normalizeFeedback(record.feedback),
    id,
    revealedFollowupQuestionIds: stringArray(
      record.revealedFollowupQuestionIds,
    ),
    startedAt,
    status: status as ExerciseAttemptStatus,
    submittedAt: trimmedText(record.submittedAt) || undefined,
    traineeId,
    traineeName,
  };
}

function normalizeFeedback(value: unknown): ExerciseFeedback | undefined {
  if (!value) {
    return undefined;
  }
  const record = asRecord(value);
  const id = trimmedText(record.id);
  const attemptId = trimmedText(record.attemptId);
  const generatedBy = record.generatedBy;
  const createdAt = trimmedText(record.createdAt);

  if (
    !id ||
    !attemptId ||
    (generatedBy !== "ai" && generatedBy !== "instructor") ||
    !createdAt
  ) {
    return undefined;
  }

  return {
    assessmentNote: trimmedText(record.assessmentNote),
    attemptId,
    createdAt,
    dataCollectionNote: trimmedText(record.dataCollectionNote),
    documentationNote: trimmedText(record.documentationNote),
    generatedBy,
    id,
    instructorComments: normalizeInstructorComments(record.instructorComments),
    rationaleNote: trimmedText(record.rationaleNote),
    supportPlanNote: trimmedText(record.supportPlanNote),
  };
}

function normalizeInstructorComments(
  value: unknown,
): ExerciseInstructorComment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const id = trimmedText(record.id);
      const instructorId = trimmedText(record.instructorId);
      const instructorName = trimmedText(record.instructorName);
      const body = trimmedText(record.body);
      const createdAt = trimmedText(record.createdAt);
      if (!id || !instructorId || !instructorName || !body || !createdAt) {
        return undefined;
      }
      return { body, createdAt, id, instructorId, instructorName };
    })
    .filter((item): item is ExerciseInstructorComment => item !== undefined);
}
