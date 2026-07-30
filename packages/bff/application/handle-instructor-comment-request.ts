import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { ExerciseAttempt } from "../contracts/training.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/instructor-comments";

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleInstructorCommentOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401（`instructor_id` に必要）。 */
  authContext?: AuthenticatedUserContext;
  postComment: (input: {
    feedbackId: string;
    instructorId: string;
    instructorDisplayName?: string;
    body: string;
  }) => Promise<ExerciseAttempt>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 指導者コメント（issue #9）の BFF handler。`POST /api/instructor-comments` のみを担う
 * （read は `GET /api/exercise-attempts` の応答に `feedback.instructorComments` として
 * 埋め込まれるため、専用の GET は無い）。
 */
export async function handleInstructorCommentRequest(
  request: BffHttpRequest,
  options: HandleInstructorCommentOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && request.path === COLLECTION_PATH) {
    return response(204, {});
  }

  if (request.path !== COLLECTION_PATH) {
    return response(404, { error: "not found" });
  }

  if (!options.trainingDataConfigured) {
    return response(503, { error: "training data store is not configured" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  if (request.method !== "POST") {
    return response(404, { error: "not found" });
  }

  const authContext = options.authContext;

  try {
    const body = parseJsonBody(request);
    const feedbackId = textField(body.feedbackId);
    if (!feedbackId) {
      throw new BadRequestError("feedbackId is required");
    }
    const commentBody = textField(body.body);
    if (!commentBody) {
      throw new BadRequestError("body is required");
    }

    const attempt = await options.postComment({
      body: commentBody,
      feedbackId,
      instructorDisplayName: authContext.displayName,
      instructorId: authContext.userId,
    });

    return response(200, attempt);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("instructor comment request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "instructor comment request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
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
