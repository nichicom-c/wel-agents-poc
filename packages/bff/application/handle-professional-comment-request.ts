import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import {
  type CommentType,
  isCommentType,
  type ProfessionalComment,
} from "../contracts/professional-comments.ts";
import {
  isSoapCategory,
  type SoapCategory,
} from "../contracts/soap-records.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/professional-comments";

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleProfessionalCommentOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401（`author_id` に必要）。 */
  authContext?: AuthenticatedUserContext;
  createComment: (input: {
    targetRecordId: string;
    targetRecordVersionId: string;
    soapCategory?: SoapCategory;
    commentType: CommentType;
    body: string;
    authorId: string;
    authorDisplayName?: string;
    authorRoleAtPost: string;
  }) => Promise<ProfessionalComment>;
  listCommentsForVersion: (input: {
    targetRecordVersionId: string;
  }) => Promise<ProfessionalComment[]>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 専門職コメント（issue #8）の BFF handler。
 *
 * `POST /api/professional-comments` は対象記録版へのコメントを1件作る。
 * `GET /api/professional-comments?targetRecordVersionId=...` は指定した記録版へのコメント一覧
 * （Knowledge Review の「記録から探す」タブが使う）を返す。
 */
export async function handleProfessionalCommentRequest(
  request: BffHttpRequest,
  options: HandleProfessionalCommentOptions,
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

  const authContext = options.authContext;

  try {
    if (request.method === "POST") {
      return await handleCreate(request, authContext, options);
    }

    if (request.method === "GET") {
      const targetRecordVersionId = textField(
        request.query?.targetRecordVersionId,
      );
      if (!targetRecordVersionId) {
        throw new BadRequestError("targetRecordVersionId query is required");
      }
      const comments = await options.listCommentsForVersion({
        targetRecordVersionId,
      });
      return response(200, { comments });
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("professional comment request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "professional comment request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  authContext: AuthenticatedUserContext,
  options: HandleProfessionalCommentOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const targetRecordId = textField(body.targetRecordId);
  if (!targetRecordId) {
    throw new BadRequestError("targetRecordId is required");
  }

  const targetRecordVersionId = textField(body.targetRecordVersionId);
  if (!targetRecordVersionId) {
    throw new BadRequestError("targetRecordVersionId is required");
  }

  const commentType = body.commentType;
  if (!isCommentType(commentType)) {
    throw new BadRequestError("commentType must be a valid comment type");
  }

  const commentBody = textField(body.body);
  if (!commentBody) {
    throw new BadRequestError("body is required");
  }

  const rawSoapCategory = body.soapCategory;
  if (rawSoapCategory !== undefined && !isSoapCategory(rawSoapCategory)) {
    throw new BadRequestError("soapCategory must be a valid SOAP category");
  }

  const authorRoleAtPost = textField(body.authorRoleAtPost);
  if (!authorRoleAtPost) {
    throw new BadRequestError("authorRoleAtPost is required");
  }

  const comment = await options.createComment({
    authorDisplayName: authContext.displayName,
    authorId: authContext.userId,
    authorRoleAtPost,
    body: commentBody,
    commentType,
    soapCategory: isSoapCategory(rawSoapCategory) ? rawSoapCategory : undefined,
    targetRecordId,
    targetRecordVersionId,
  });

  return response(200, comment);
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

/** request body / query など client 起因の 400 に変換する error。 */
class BadRequestError extends Error {
  override name = "BadRequestError";
}
