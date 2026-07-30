import type {
  RequiredItemFilters,
  RequiredRecommendedItem,
  RequirementLevel,
} from "../contracts/admin.ts";
import { isRequirementLevel } from "../contracts/admin.ts";
import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import {
  isSoapRecordType,
  type SoapRecordType,
} from "../contracts/soap-records.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/required-items";

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleRequiredItemOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401。 */
  authContext?: AuthenticatedUserContext;
  listItems: (
    filters: RequiredItemFilters,
  ) => Promise<RequiredRecommendedItem[]>;
  createItem: (input: {
    recordType: SoapRecordType;
    specialtyId?: string;
    itemName: string;
    requirementLevel: RequirementLevel;
    aggregationCategory: string;
  }) => Promise<RequiredRecommendedItem>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 必須・推奨項目（issue #10）の BFF handler。
 * `GET /api/required-items`（記録種別/分野 filter）+ `POST /api/required-items` を担う。
 */
export async function handleRequiredItemRequest(
  request: BffHttpRequest,
  options: HandleRequiredItemOptions,
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

  try {
    if (request.method === "GET") {
      const items = await options.listItems(filtersFromQuery(request.query));
      return response(200, { items });
    }

    if (request.method === "POST") {
      return await handleCreate(request, options);
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("required item request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "required item request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  options: HandleRequiredItemOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const recordType = body.recordType;
  if (!isSoapRecordType(recordType)) {
    throw new BadRequestError("recordType must be a valid SOAP record type");
  }

  const itemName = textField(body.itemName);
  if (!itemName) {
    throw new BadRequestError("itemName is required");
  }

  const requirementLevel = body.requirementLevel;
  if (!isRequirementLevel(requirementLevel)) {
    throw new BadRequestError(
      "requirementLevel must be one of required, recommended",
    );
  }

  const aggregationCategory = textField(body.aggregationCategory);
  if (!aggregationCategory) {
    throw new BadRequestError("aggregationCategory is required");
  }

  const item = await options.createItem({
    aggregationCategory,
    itemName,
    recordType,
    requirementLevel,
    specialtyId: textField(body.specialtyId) || undefined,
  });

  return response(200, item);
}

function filtersFromQuery(
  query: Record<string, string | undefined> | undefined,
): RequiredItemFilters {
  const rawRecordType = query?.recordType;
  return {
    recordType: isSoapRecordType(rawRecordType) ? rawRecordType : undefined,
    specialtyId: textField(query?.specialtyId) || undefined,
  };
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
