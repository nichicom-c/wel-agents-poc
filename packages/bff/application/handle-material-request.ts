import type {
  Material,
  MaterialFilters,
  MaterialType,
  PublicationStatus,
} from "../contracts/admin.ts";
import { isMaterialType, isPublicationStatus } from "../contracts/admin.ts";
import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/materials";
const STATUS_PATH_PATTERN = /^\/api\/materials\/([^/]+)\/status$/;

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleMaterialOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401（`created_by` に必要）。 */
  authContext?: AuthenticatedUserContext;
  listMaterials: (filters: MaterialFilters) => Promise<Material[]>;
  createMaterial: (input: {
    materialType: MaterialType;
    title: string;
    specialtyId?: string;
    learningThemeId?: string;
    difficultyId?: string;
    createdBy: string;
    createdByDisplayName?: string;
  }) => Promise<Material>;
  changeStatus: (input: {
    id: string;
    nextStatus: PublicationStatus;
    changedBy: string;
    changedByDisplayName?: string;
  }) => Promise<Material>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 教材（issue #10）の BFF handler。
 *
 * `GET /api/materials`（教材種別/公開状態 filter）+ `POST /api/materials` +
 * `PATCH /api/materials/{id}/status` を担う。公開状態は明示的な state として管理する
 * （issue #10 の Technical Approach）。
 */
export async function handleMaterialRequest(
  request: BffHttpRequest,
  options: HandleMaterialOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isMaterialPath(request.path)) {
    return response(204, {});
  }

  if (!isMaterialPath(request.path)) {
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
      const materials = await options.listMaterials(
        filtersFromQuery(request.query),
      );
      return response(200, { materials });
    }

    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleCreate(request, authContext, options);
    }

    const statusMaterialId = statusMaterialIdFromPath(request.path);
    if (statusMaterialId && request.method === "PATCH") {
      return await handleChangeStatus(
        request,
        statusMaterialId,
        authContext,
        options,
      );
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("material request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "material request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  authContext: AuthenticatedUserContext,
  options: HandleMaterialOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const materialType = body.materialType;
  if (!isMaterialType(materialType)) {
    throw new BadRequestError("materialType must be a valid material type");
  }

  const title = textField(body.title);
  if (!title) {
    throw new BadRequestError("title is required");
  }

  const material = await options.createMaterial({
    createdBy: authContext.userId,
    createdByDisplayName: authContext.displayName,
    difficultyId: textField(body.difficultyId) || undefined,
    learningThemeId: textField(body.learningThemeId) || undefined,
    materialType,
    specialtyId: textField(body.specialtyId) || undefined,
    title,
  });

  return response(200, material);
}

async function handleChangeStatus(
  request: BffHttpRequest,
  materialId: string,
  authContext: AuthenticatedUserContext,
  options: HandleMaterialOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const nextStatus = body.status;
  if (!isPublicationStatus(nextStatus)) {
    throw new BadRequestError(
      "status must be one of draft, reviewing, published, archived",
    );
  }

  const material = await options.changeStatus({
    changedBy: authContext.userId,
    changedByDisplayName: authContext.displayName,
    id: materialId,
    nextStatus,
  });

  return response(200, material);
}

function filtersFromQuery(
  query: Record<string, string | undefined> | undefined,
): MaterialFilters {
  const rawMaterialType = query?.materialType;
  const rawPublicationStatus = query?.publicationStatus;
  return {
    materialType: isMaterialType(rawMaterialType) ? rawMaterialType : undefined,
    publicationStatus: isPublicationStatus(rawPublicationStatus)
      ? rawPublicationStatus
      : undefined,
  };
}

function isMaterialPath(path: string): boolean {
  return path === COLLECTION_PATH || STATUS_PATH_PATTERN.test(path);
}

function statusMaterialIdFromPath(path: string): string | undefined {
  const match = STATUS_PATH_PATTERN.exec(path);
  const materialId = match?.[1];
  return materialId ? decodeURIComponent(materialId) : undefined;
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
