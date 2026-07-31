import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import {
  type ExerciseCase,
  ExerciseCaseAlreadyExistsError,
  type ExerciseCaseFilters,
  ExerciseCaseMaterialNotFoundError,
  ExerciseCaseMaterialTypeError,
  isModelAnswerType,
  type ModelAnswerType,
} from "../contracts/training.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/exercise-cases";
const DETAIL_PATH_PATTERN = /^\/api\/exercise-cases\/([^/]+)$/;

export type CreateExerciseCaseInput = {
  materialId: string;
  initialPresentation: string;
  expectedWorkScene?: string;
  constraintsText?: string;
  requiredInstitutionalKnowledge?: string;
  followupQuestions: { questionText: string; revealedInfoText: string }[];
  modelAnswers: {
    answerType: ModelAnswerType;
    content: string;
    acceptableNote?: string;
  }[];
  rubricIds: string[];
};

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleExerciseCaseOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401。 */
  authContext?: AuthenticatedUserContext;
  listCases: (filters: ExerciseCaseFilters) => Promise<ExerciseCase[]>;
  getCaseById: (id: string) => Promise<ExerciseCase | undefined>;
  createCase: (input: CreateExerciseCaseInput) => Promise<ExerciseCase>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 演習ケース（issue #9）の BFF handler。
 *
 * `GET /api/exercise-cases`（分野/難易度/学習テーマ filter、公開済みのみ）+
 * `GET /api/exercise-cases/{id}` の read に加え、`POST /api/exercise-cases` で既存の教材
 * （`material_type: teaching_case`）から演習ケースを作る。更新 UI はまだ無い。
 */
export async function handleExerciseCaseRequest(
  request: BffHttpRequest,
  options: HandleExerciseCaseOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isExerciseCasePath(request.path)) {
    return response(204, {});
  }

  if (!isExerciseCasePath(request.path)) {
    return response(404, { error: "not found" });
  }

  if (!options.trainingDataConfigured) {
    return response(503, { error: "training data store is not configured" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  try {
    if (request.method === "GET" && request.path === COLLECTION_PATH) {
      const cases = await options.listCases(filtersFromQuery(request.query));
      return response(200, { cases });
    }

    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleCreate(request, options);
    }

    if (request.method === "GET") {
      const caseId = detailCaseIdFromPath(request.path);
      if (caseId) {
        const exerciseCase = await options.getCaseById(caseId);
        if (!exerciseCase) {
          return response(404, { error: "not found" });
        }
        return response(200, exerciseCase);
      }
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (
      error instanceof ExerciseCaseMaterialNotFoundError ||
      error instanceof ExerciseCaseMaterialTypeError ||
      error instanceof ExerciseCaseAlreadyExistsError ||
      error instanceof BadRequestError
    ) {
      return response(400, { error: error.message });
    }

    options.logError?.("exercise case request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "exercise case request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  options: HandleExerciseCaseOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const materialId = textField(body.materialId);
  if (!materialId) {
    throw new BadRequestError("materialId is required");
  }

  const initialPresentation = textField(body.initialPresentation);
  if (!initialPresentation) {
    throw new BadRequestError("initialPresentation is required");
  }

  const exerciseCase = await options.createCase({
    constraintsText: textField(body.constraintsText) || undefined,
    expectedWorkScene: textField(body.expectedWorkScene) || undefined,
    followupQuestions: followupQuestionsFromBody(body.followupQuestions),
    initialPresentation,
    materialId,
    modelAnswers: modelAnswersFromBody(body.modelAnswers),
    requiredInstitutionalKnowledge:
      textField(body.requiredInstitutionalKnowledge) || undefined,
    rubricIds: stringArray(body.rubricIds),
  });

  return response(200, exerciseCase);
}

function followupQuestionsFromBody(
  value: unknown,
): { questionText: string; revealedInfoText: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const record = asRecord(entry);
    const questionText = textField(record.questionText);
    const revealedInfoText = textField(record.revealedInfoText);
    if (!questionText || !revealedInfoText) {
      throw new BadRequestError(
        "followupQuestions items require questionText and revealedInfoText",
      );
    }
    return { questionText, revealedInfoText };
  });
}

function modelAnswersFromBody(value: unknown): {
  answerType: ModelAnswerType;
  content: string;
  acceptableNote?: string;
}[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const record = asRecord(entry);
    const answerType = record.answerType;
    const content = textField(record.content);
    if (!isModelAnswerType(answerType) || !content) {
      throw new BadRequestError(
        "modelAnswers items require a valid answerType and content",
      );
    }
    return {
      acceptableNote: textField(record.acceptableNote) || undefined,
      answerType,
      content,
    };
  });
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function filtersFromQuery(
  query: Record<string, string | undefined> | undefined,
): ExerciseCaseFilters {
  return {
    difficultyId: textField(query?.difficultyId) || undefined,
    learningThemeId: textField(query?.learningThemeId) || undefined,
    specialtyId: textField(query?.specialtyId) || undefined,
  };
}

function isExerciseCasePath(path: string): boolean {
  return path === COLLECTION_PATH || DETAIL_PATH_PATTERN.test(path);
}

function detailCaseIdFromPath(path: string): string | undefined {
  const match = DETAIL_PATH_PATTERN.exec(path);
  const caseId = match?.[1];
  return caseId ? decodeURIComponent(caseId) : undefined;
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
