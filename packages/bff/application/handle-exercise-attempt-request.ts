import { randomUUID } from "node:crypto";

import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { RuntimeInvoker, RuntimePayload } from "../contracts/runtime.ts";
import type {
  ExerciseAttempt,
  ExerciseAttemptAnswers,
  ExerciseFeedbackGeneratedBy,
} from "../contracts/training.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/exercise-attempts";
const REVEAL_PATH_PATTERN =
  /^\/api\/exercise-attempts\/([^/]+)\/reveal-followup$/;
const DRAFT_PATH_PATTERN = /^\/api\/exercise-attempts\/([^/]+)\/draft-answers$/;
const SUBMIT_PATH_PATTERN = /^\/api\/exercise-attempts\/([^/]+)\/submit$/;

export type AttachFeedbackInput = {
  attemptId: string;
  generatedBy: ExerciseFeedbackGeneratedBy;
  dataCollectionNote: string;
  rationaleNote: string;
  assessmentNote: string;
  supportPlanNote: string;
  documentationNote: string;
};

/** BFF core の依存。adapter ごとに RDS Data API / AgentCore Runtime 呼び出しの実装を注入する。 */
export type HandleExerciseAttemptOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401（`trainee_id` に必要）。 */
  authContext?: AuthenticatedUserContext;
  startAttempt: (input: {
    exerciseCaseId: string;
    traineeId: string;
    traineeDisplayName?: string;
  }) => Promise<ExerciseAttempt>;
  revealFollowup: (input: {
    attemptId: string;
    questionId: string;
  }) => Promise<ExerciseAttempt>;
  saveDraftAnswers: (input: {
    attemptId: string;
    answers: ExerciseAttemptAnswers;
  }) => Promise<ExerciseAttempt>;
  getAttemptById: (id: string) => Promise<ExerciseAttempt>;
  markAttemptSubmitted: (input: {
    attemptId: string;
  }) => Promise<ExerciseAttempt>;
  attachFeedback: (input: AttachFeedbackInput) => Promise<ExerciseAttempt>;
  listAttemptsForTrainee: (traineeId: string) => Promise<ExerciseAttempt[]>;
  listInstructorQueue: () => Promise<ExerciseAttempt[]>;
  /** 演習フィードバック生成のための AgentCore Runtime 呼び出し。 */
  invokeRuntime: RuntimeInvoker;
  /** runtime session ID 生成（テスト用。省略時は randomUUID）。 */
  createSessionId?: () => string;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 演習の受講記録（issue #9）の BFF handler。
 *
 * `POST /api/exercise-attempts` は演習ケースへの回答を開始する。
 * `PATCH /api/exercise-attempts/{id}/reveal-followup` は追加質問を開示する。
 * `PATCH /api/exercise-attempts/{id}/draft-answers` は回答の下書きを保存する。
 * `POST /api/exercise-attempts/{id}/submit` は提出し、AgentCore の演習フィードバック agent
 * （`type: "exercise_feedback"`）を呼んで5観点のフィードバックを生成・保存する。
 * `GET /api/exercise-attempts?scope=mine|instructor-queue` は一覧を返す。
 */
export async function handleExerciseAttemptRequest(
  request: BffHttpRequest,
  options: HandleExerciseAttemptOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isExerciseAttemptPath(request.path)) {
    return response(204, {});
  }

  if (!isExerciseAttemptPath(request.path)) {
    return response(404, { error: "not found" });
  }

  if (!options.trainingDataConfigured) {
    return response(503, { error: "training data store is not configured" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  const authContext = options.authContext;

  try {
    if (request.method === "GET" && request.path === COLLECTION_PATH) {
      return await handleList(request, authContext, options);
    }

    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleStart(request, authContext, options);
    }

    const revealAttemptId = pathIdFromPattern(
      request.path,
      REVEAL_PATH_PATTERN,
    );
    if (revealAttemptId && request.method === "PATCH") {
      return await handleReveal(request, revealAttemptId, options);
    }

    const draftAttemptId = pathIdFromPattern(request.path, DRAFT_PATH_PATTERN);
    if (draftAttemptId && request.method === "PATCH") {
      return await handleSaveDraft(request, draftAttemptId, options);
    }

    const submitAttemptId = pathIdFromPattern(
      request.path,
      SUBMIT_PATH_PATTERN,
    );
    if (submitAttemptId && request.method === "POST") {
      return await handleSubmit(submitAttemptId, authContext, options);
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("exercise attempt request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "exercise attempt request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleList(
  request: BffHttpRequest,
  authContext: AuthenticatedUserContext,
  options: HandleExerciseAttemptOptions,
): Promise<BffHttpResponse> {
  const scope = textField(request.query?.scope) || "mine";
  if (scope === "instructor-queue") {
    const attempts = await options.listInstructorQueue();
    return response(200, { attempts });
  }
  const attempts = await options.listAttemptsForTrainee(authContext.userId);
  return response(200, { attempts });
}

async function handleStart(
  request: BffHttpRequest,
  authContext: AuthenticatedUserContext,
  options: HandleExerciseAttemptOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);
  const exerciseCaseId = textField(body.exerciseCaseId);
  if (!exerciseCaseId) {
    throw new BadRequestError("exerciseCaseId is required");
  }

  const attempt = await options.startAttempt({
    exerciseCaseId,
    traineeDisplayName: authContext.displayName,
    traineeId: authContext.userId,
  });

  return response(200, attempt);
}

async function handleReveal(
  request: BffHttpRequest,
  attemptId: string,
  options: HandleExerciseAttemptOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);
  const questionId = textField(body.questionId);
  if (!questionId) {
    throw new BadRequestError("questionId is required");
  }

  const attempt = await options.revealFollowup({ attemptId, questionId });
  return response(200, attempt);
}

async function handleSaveDraft(
  request: BffHttpRequest,
  attemptId: string,
  options: HandleExerciseAttemptOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);
  const answersRecord = asRecord(body.answers);

  const attempt = await options.saveDraftAnswers({
    answers: {
      additionalConfirmationText: textField(
        answersRecord.additionalConfirmationText,
      ),
      assessmentText: textField(answersRecord.assessmentText),
      soapText: textField(answersRecord.soapText),
      supportPlanText: textField(answersRecord.supportPlanText),
    },
    attemptId,
  });

  return response(200, attempt);
}

async function handleSubmit(
  attemptId: string,
  authContext: AuthenticatedUserContext,
  options: HandleExerciseAttemptOptions,
): Promise<BffHttpResponse> {
  const current = await options.getAttemptById(attemptId);
  if (current.status !== "in_progress") {
    throw new BadRequestError("attempt is not in_progress");
  }
  if (
    !current.answers.soapText.trim() ||
    !current.answers.assessmentText.trim() ||
    !current.answers.supportPlanText.trim()
  ) {
    throw new BadRequestError(
      "soapText, assessmentText, and supportPlanText are required before submitting",
    );
  }

  const submitted = await options.markAttemptSubmitted({ attemptId });

  const sessionId = (options.createSessionId ?? randomUUID)();
  const runtimePayload: RuntimePayload = {
    actor_id: authContext.actorId,
    exercise_answers: submitted.answers,
    exercise_case: {
      constraintsText: submitted.exerciseCase.constraintsText,
      evaluationCriteria: submitted.exerciseCase.evaluationCriteria,
      expectedWorkScene: submitted.exerciseCase.expectedWorkScene,
      initialPresentation: submitted.exerciseCase.initialPresentation,
      modelAnswers: submitted.exerciseCase.modelAnswers,
      requiredInstitutionalKnowledge:
        submitted.exerciseCase.requiredInstitutionalKnowledge,
      title: submitted.exerciseCase.title,
    },
    session_id: sessionId,
    type: "exercise_feedback",
  };

  const runtimeResponse = await options.invokeRuntime(
    sessionId,
    runtimePayload,
  );

  if (!runtimeResponse.ok) {
    return response(502, {
      error: "AgentCore invoke failed",
      message: runtimeResponse.body,
      statusCode: runtimeResponse.statusCode,
    });
  }

  const payload = asRecord(runtimeResponse.payload);

  if (payload.status === "error") {
    return response(502, {
      error: "AgentCore invoke failed",
      message:
        typeof payload.error === "string" ? payload.error : "unknown error",
    });
  }

  const attempt = await options.attachFeedback({
    assessmentNote: textField(payload.assessmentNote),
    attemptId,
    dataCollectionNote: textField(payload.dataCollectionNote),
    documentationNote: textField(payload.documentationNote),
    generatedBy: "ai",
    rationaleNote: textField(payload.rationaleNote),
    supportPlanNote: textField(payload.supportPlanNote),
  });

  return response(200, attempt);
}

function pathIdFromPattern(path: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(path);
  const id = match?.[1];
  return id ? decodeURIComponent(id) : undefined;
}

function isExerciseAttemptPath(path: string): boolean {
  return (
    path === COLLECTION_PATH ||
    REVEAL_PATH_PATTERN.test(path) ||
    DRAFT_PATH_PATTERN.test(path) ||
    SUBMIT_PATH_PATTERN.test(path)
  );
}

/** JSON body を object として parse する。base64 body は UTF-8 に decode してから読む。 */
function parseJsonBody(request: BffHttpRequest): Record<string, unknown> {
  const rawBody = request.isBase64Encoded
    ? Buffer.from(request.body || "", "base64").toString("utf8")
    : request.body || "{}";

  try {
    const parsed = JSON.parse(rawBody);
    return asRecord(parsed);
  } catch {
    throw new BadRequestError("request body must be valid JSON");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Lambda 互換の JSON response を組み立てる。 */
function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}

/** request body など client 起因の 400 に変換する error。 */
class BadRequestError extends Error {
  override name = "BadRequestError";
}
