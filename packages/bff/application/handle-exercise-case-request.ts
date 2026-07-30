import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type {
  ExerciseCase,
  ExerciseCaseFilters,
} from "../contracts/training.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/exercise-cases";
const DETAIL_PATH_PATTERN = /^\/api\/exercise-cases\/([^/]+)$/;

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleExerciseCaseOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401。 */
  authContext?: AuthenticatedUserContext;
  listCases: (filters: ExerciseCaseFilters) => Promise<ExerciseCase[]>;
  getCaseById: (id: string) => Promise<ExerciseCase | undefined>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 演習ケース（issue #9）の BFF handler。
 *
 * `GET /api/exercise-cases`（分野/難易度/学習テーマ filter、公開済みのみ）+
 * `GET /api/exercise-cases/{id}` の read のみを担う。作成/更新 UI はまだ無い
 * （issue #10 の Admin から `materials` 行を作るところまでしか実装が無い）。
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

  if (request.method !== "GET") {
    return response(404, { error: "not found" });
  }

  try {
    if (request.path === COLLECTION_PATH) {
      const cases = await options.listCases(filtersFromQuery(request.query));
      return response(200, { cases });
    }

    const caseId = detailCaseIdFromPath(request.path);
    if (caseId) {
      const exerciseCase = await options.getCaseById(caseId);
      if (!exerciseCase) {
        return response(404, { error: "not found" });
      }
      return response(200, exerciseCase);
    }

    return response(404, { error: "not found" });
  } catch (error) {
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

/** Lambda 互換の JSON response を組み立てる。 */
function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}
