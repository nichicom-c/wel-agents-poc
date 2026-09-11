import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { CreateRubricInput, Rubric } from "../contracts/rubric.ts";
import { isRubricLevelNumber } from "../contracts/rubric.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/rubrics";
const ACTIVE_PATH_PATTERN = /^\/api\/rubrics\/([^/]+)\/active$/;

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleRubricOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401。 */
  authContext?: AuthenticatedUserContext;
  listRubrics: () => Promise<Rubric[]>;
  createRubric: (input: CreateRubricInput) => Promise<Rubric>;
  setActive: (input: { id: string; isActive: boolean }) => Promise<Rubric>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 評価ルーブリック（保健師SOAP_KB_詳細設計書_v2 の rubric / rubric_level）の BFF handler。
 *
 * `GET /api/rubrics` + `POST /api/rubrics` + `PATCH /api/rubrics/{id}/active` を担う。
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

  try {
    if (request.method === "GET" && request.path === COLLECTION_PATH) {
      const rubrics = await options.listRubrics();
      return response(200, { rubrics });
    }

    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleCreate(request, options);
    }

    const activeRubricId = activeRubricIdFromPath(request.path);
    if (activeRubricId && request.method === "PATCH") {
      return await handleSetActive(request, activeRubricId, options);
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
  options: HandleRubricOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const knowledgeBaseId = textField(body.knowledgeBaseId);
  if (!knowledgeBaseId) {
    throw new BadRequestError("knowledgeBaseId is required");
  }

  const code = textField(body.code);
  if (!code) {
    throw new BadRequestError("code is required");
  }

  const name = textField(body.name);
  if (!name) {
    throw new BadRequestError("name is required");
  }

  const objective = textField(body.objective);
  if (!objective) {
    throw new BadRequestError("objective is required");
  }

  const sortOrder =
    typeof body.sortOrder === "number" ? body.sortOrder : undefined;

  const levels = parseLevels(body.levels);

  const rubric = await options.createRubric({
    code,
    knowledgeBaseId,
    levels,
    name,
    objective,
    sortOrder,
  });

  return response(200, rubric);
}

function parseLevels(value: unknown): CreateRubricInput["levels"] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestError("levels must be a non-empty array");
  }

  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new BadRequestError("each level must be an object");
    }
    const record = entry as Record<string, unknown>;

    if (!isRubricLevelNumber(record.level)) {
      throw new BadRequestError("level must be an integer between 1 and 4");
    }

    const levelName = textField(record.levelName);
    if (!levelName) {
      throw new BadRequestError("levelName is required for each level");
    }

    const definition = textField(record.definition);
    if (!definition) {
      throw new BadRequestError("definition is required for each level");
    }

    const criteria = Array.isArray(record.criteria)
      ? record.criteria.filter(
          (item): item is string => typeof item === "string",
        )
      : [];

    return { criteria, definition, level: record.level, levelName };
  });
}

async function handleSetActive(
  request: BffHttpRequest,
  rubricId: string,
  options: HandleRubricOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  if (typeof body.isActive !== "boolean") {
    throw new BadRequestError("isActive must be a boolean");
  }

  const rubric = await options.setActive({
    id: rubricId,
    isActive: body.isActive,
  });

  return response(200, rubric);
}

function isRubricPath(path: string): boolean {
  return path === COLLECTION_PATH || ACTIVE_PATH_PATTERN.test(path);
}

function activeRubricIdFromPath(path: string): string | undefined {
  const match = ACTIVE_PATH_PATTERN.exec(path);
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
