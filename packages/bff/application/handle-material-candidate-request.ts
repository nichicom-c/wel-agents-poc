import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import {
  isMaterialCandidateStatus,
  type MaterialCandidate,
  type MaterialCandidateFilters,
  type MaterialCandidateStatus,
} from "../contracts/material-candidates.ts";
import {
  isSoapRecordType,
  type SoapRecordType,
} from "../contracts/soap-records.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/material-candidates";
const STATUS_PATH_PATTERN = /^\/api\/material-candidates\/([^/]+)\/status$/;

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleMaterialCandidateOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401（`created_by` に必要）。 */
  authContext?: AuthenticatedUserContext;
  listCandidates: (
    filters: MaterialCandidateFilters,
  ) => Promise<MaterialCandidate[]>;
  createCandidate: (input: {
    title: string;
    summary: string;
    specialtyId?: string;
    recordType?: SoapRecordType;
    learningThemeId?: string;
    difficultyId?: string;
    commentIds: string[];
    createdBy: string;
    createdByDisplayName?: string;
    createdByRole: string;
  }) => Promise<MaterialCandidate>;
  decideStatus: (input: {
    id: string;
    nextStatus: MaterialCandidateStatus;
    changedBy: string;
    changedByDisplayName?: string;
    changedByRole: string;
    reasonCode?: string;
    reasonText?: string;
  }) => Promise<MaterialCandidate>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 教材候補（issue #8）の BFF handler。
 *
 * `GET /api/material-candidates` は分野・記録種別・学習テーマ・難易度・状態で検索できる一覧。
 * `POST /api/material-candidates` は選択した専門職コメントを束ねて新しい教材候補（status:
 * candidate）を作る。`PATCH /api/material-candidates/{id}/status` は承認/却下/要修正の
 * 状態遷移を記録する（承認 gate）。
 */
export async function handleMaterialCandidateRequest(
  request: BffHttpRequest,
  options: HandleMaterialCandidateOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isMaterialCandidatePath(request.path)) {
    return response(204, {});
  }

  if (!isMaterialCandidatePath(request.path)) {
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
      const candidates = await options.listCandidates(
        filtersFromQuery(request.query),
      );
      return response(200, { candidates });
    }

    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleCreate(request, authContext, options);
    }

    const statusCandidateId = statusCandidateIdFromPath(request.path);
    if (statusCandidateId && request.method === "PATCH") {
      return await handleDecideStatus(
        request,
        statusCandidateId,
        authContext,
        options,
      );
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("material candidate request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "material candidate request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  authContext: AuthenticatedUserContext,
  options: HandleMaterialCandidateOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const title = textField(body.title);
  if (!title) {
    throw new BadRequestError("title is required");
  }

  const summary = textField(body.summary);
  if (!summary) {
    throw new BadRequestError("summary is required");
  }

  const rawRecordType = body.recordType;
  if (rawRecordType !== undefined && !isSoapRecordType(rawRecordType)) {
    throw new BadRequestError("recordType must be a valid SOAP record type");
  }

  const commentIds = commentIdsFromBody(body.commentIds);
  if (commentIds.length === 0) {
    throw new BadRequestError("commentIds must be a non-empty array");
  }

  const createdByRole = textField(body.createdByRole);
  if (!createdByRole) {
    throw new BadRequestError("createdByRole is required");
  }

  const candidate = await options.createCandidate({
    commentIds,
    createdBy: authContext.userId,
    createdByDisplayName: authContext.displayName,
    createdByRole,
    difficultyId: textField(body.difficultyId) || undefined,
    learningThemeId: textField(body.learningThemeId) || undefined,
    recordType: isSoapRecordType(rawRecordType) ? rawRecordType : undefined,
    specialtyId: textField(body.specialtyId) || undefined,
    summary,
    title,
  });

  return response(200, candidate);
}

async function handleDecideStatus(
  request: BffHttpRequest,
  candidateId: string,
  authContext: AuthenticatedUserContext,
  options: HandleMaterialCandidateOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const nextStatus = body.status;
  if (!isMaterialCandidateStatus(nextStatus)) {
    throw new BadRequestError(
      "status must be one of candidate, approved, rejected, needs_revision",
    );
  }

  const changedByRole = textField(body.changedByRole);
  if (!changedByRole) {
    throw new BadRequestError("changedByRole is required");
  }

  const reasonCode = textField(body.reasonCode) || undefined;
  const reasonText = textField(body.reasonText) || undefined;

  if (nextStatus === "rejected" && !reasonCode) {
    throw new BadRequestError("reasonCode is required when status is rejected");
  }
  if (nextStatus === "needs_revision" && !reasonText) {
    throw new BadRequestError(
      "reasonText is required when status is needs_revision",
    );
  }

  const candidate = await options.decideStatus({
    changedBy: authContext.userId,
    changedByDisplayName: authContext.displayName,
    changedByRole,
    id: candidateId,
    nextStatus,
    reasonCode,
    reasonText,
  });

  return response(200, candidate);
}

function filtersFromQuery(
  query: Record<string, string | undefined> | undefined,
): MaterialCandidateFilters {
  const rawRecordType = query?.recordType;
  const rawStatus = query?.status;
  return {
    difficultyId: textField(query?.difficultyId) || undefined,
    learningThemeId: textField(query?.learningThemeId) || undefined,
    recordType: isSoapRecordType(rawRecordType) ? rawRecordType : undefined,
    specialtyId: textField(query?.specialtyId) || undefined,
    status: isMaterialCandidateStatus(rawStatus) ? rawStatus : undefined,
  };
}

function commentIdsFromBody(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function isMaterialCandidatePath(path: string): boolean {
  return path === COLLECTION_PATH || STATUS_PATH_PATTERN.test(path);
}

function statusCandidateIdFromPath(path: string): string | undefined {
  const match = STATUS_PATH_PATTERN.exec(path);
  const candidateId = match?.[1];
  return candidateId ? decodeURIComponent(candidateId) : undefined;
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
