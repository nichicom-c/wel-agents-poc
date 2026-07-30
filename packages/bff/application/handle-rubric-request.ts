import type {
  Rubric,
  RubricReviewStatus,
  RubricTargetType,
} from "../contracts/admin.ts";
import {
  isRubricReviewStatus,
  isRubricTargetType,
} from "../contracts/admin.ts";
import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/rubrics";
const REVIEW_STATUS_PATH_PATTERN = /^\/api\/rubrics\/([^/]+)\/review-status$/;

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleRubricOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401（`created_by` に必要）。 */
  authContext?: AuthenticatedUserContext;
  listRubrics: () => Promise<Rubric[]>;
  createRubric: (input: {
    name: string;
    targetType: RubricTargetType;
    createdBy: string;
    createdByDisplayName?: string;
  }) => Promise<Rubric>;
  setReviewStatus: (input: {
    id: string;
    nextStatus: RubricReviewStatus;
  }) => Promise<Rubric>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 評価ルーブリック（issue #10）の BFF handler。
 *
 * `GET /api/rubrics` + `POST /api/rubrics` + `PATCH /api/rubrics/{id}/review-status` を担う。
 * 有識者確認前と確認済みを区別する（issue #10 の Technical Approach）。
 */
export async function handleRubricRequest(
  request: BffHttpRequest,
  options: HandleRubricOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isRubricPath(request.path)) {
    return response(204, {});
  }

  if (!isRubricPath(request.path)) {
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
      const rubrics = await options.listRubrics();
      return response(200, { rubrics });
    }

    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleCreate(request, authContext, options);
    }

    const reviewStatusRubricId = reviewStatusRubricIdFromPath(request.path);
    if (reviewStatusRubricId && request.method === "PATCH") {
      return await handleSetReviewStatus(
        request,
        reviewStatusRubricId,
        options,
      );
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("rubric request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "rubric request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  authContext: AuthenticatedUserContext,
  options: HandleRubricOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const name = textField(body.name);
  if (!name) {
    throw new BadRequestError("name is required");
  }

  const targetType = body.targetType;
  if (!isRubricTargetType(targetType)) {
    throw new BadRequestError("targetType must be a valid rubric target type");
  }

  const rubric = await options.createRubric({
    createdBy: authContext.userId,
    createdByDisplayName: authContext.displayName,
    name,
    targetType,
  });

  return response(200, rubric);
}

async function handleSetReviewStatus(
  request: BffHttpRequest,
  rubricId: string,
  options: HandleRubricOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const nextStatus = body.reviewStatus;
  if (!isRubricReviewStatus(nextStatus)) {
    throw new BadRequestError(
      "reviewStatus must be one of expert_review_required, confirmed",
    );
  }

  const rubric = await options.setReviewStatus({ id: rubricId, nextStatus });

  return response(200, rubric);
}

function isRubricPath(path: string): boolean {
  return path === COLLECTION_PATH || REVIEW_STATUS_PATH_PATTERN.test(path);
}

function reviewStatusRubricIdFromPath(path: string): string | undefined {
  const match = REVIEW_STATUS_PATH_PATTERN.exec(path);
  const rubricId = match?.[1];
  return rubricId ? decodeURIComponent(rubricId) : undefined;
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
