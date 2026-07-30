import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import {
  type CreateSoapRecordVersionResult,
  isSoapCategory,
  isSoapRecordType,
  isSoapRecordVersionSource,
  type SoapRecordItem,
  type SoapRecordSummary,
  type SoapRecordType,
  type SoapRecordVersion,
  type SoapRecordVersionSource,
} from "../contracts/soap-records.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const VERSIONS_PATH_PATTERN = /^\/api\/soap-records\/([^/]+)\/versions$/;
const COLLECTION_PATH = "/api/soap-records";
const DEFAULT_SOURCE: SoapRecordVersionSource = "soap_draft_ai";

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleSoapRecordOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401（`created_by` に必要）。 */
  authContext?: AuthenticatedUserContext;
  createRecordVersion: (input: {
    recordId?: string;
    recordType: SoapRecordType;
    items: SoapRecordItem[];
    source: SoapRecordVersionSource;
    createdBy: string;
    createdByDisplayName?: string;
  }) => Promise<CreateSoapRecordVersionResult>;
  listRecords: () => Promise<SoapRecordSummary[]>;
  listVersions: (input: { recordId: string }) => Promise<SoapRecordVersion[]>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * SOAP Studio の「正式記録として保存」（issue #8 の前提）の BFF handler。
 *
 * `POST /api/soap-records` は `recordId` 省略時に新規記録 + version 1 を作り、指定時は
 * 既存記録に version を追記する。`GET /api/soap-records` は記録一覧、
 * `GET /api/soap-records/{recordId}/versions` は指定記録の版一覧（Knowledge Review の
 * 記録詳細が使う）を返す。
 */
export async function handleSoapRecordRequest(
  request: BffHttpRequest,
  options: HandleSoapRecordOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isSoapRecordPath(request.path)) {
    return response(204, {});
  }

  if (!isSoapRecordPath(request.path)) {
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
    if (request.method === "POST" && request.path === COLLECTION_PATH) {
      return await handleCreate(request, authContext, options);
    }

    if (request.method === "GET" && request.path === COLLECTION_PATH) {
      const records = await options.listRecords();
      return response(200, { records });
    }

    const versionsRecordId = versionsRecordIdFromPath(request.path);
    if (versionsRecordId && request.method === "GET") {
      const versions = await options.listVersions({
        recordId: versionsRecordId,
      });
      return response(200, { versions });
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("soap record request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "soap record request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  authContext: AuthenticatedUserContext,
  options: HandleSoapRecordOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const recordType = body.recordType;
  if (!isSoapRecordType(recordType)) {
    throw new BadRequestError("recordType must be a valid SOAP record type");
  }

  const items = itemsFromBody(body.items);
  if (items.length === 0) {
    throw new BadRequestError("items must be a non-empty array");
  }

  const recordId = textField(body.recordId) || undefined;

  const rawSource = body.source;
  if (rawSource !== undefined && !isSoapRecordVersionSource(rawSource)) {
    throw new BadRequestError(
      "source must be a valid SOAP record version source",
    );
  }
  const source = isSoapRecordVersionSource(rawSource)
    ? rawSource
    : DEFAULT_SOURCE;

  const result = await options.createRecordVersion({
    createdBy: authContext.userId,
    createdByDisplayName: authContext.displayName,
    items,
    recordId,
    recordType,
    source,
  });

  return response(200, result);
}

function itemsFromBody(value: unknown): SoapRecordItem[] {
  if (!Array.isArray(value)) {
    throw new BadRequestError("items must be an array");
  }

  return value.map((entry) => {
    const record = asRecord(entry);
    if (!isSoapCategory(record.category)) {
      throw new BadRequestError(
        "each item.category must be a valid SOAP category",
      );
    }
    const text = textField(record.text);
    if (!text) {
      throw new BadRequestError("each item.text is required");
    }
    return { category: record.category, text };
  });
}

function isSoapRecordPath(path: string): boolean {
  return path === COLLECTION_PATH || VERSIONS_PATH_PATTERN.test(path);
}

function versionsRecordIdFromPath(path: string): string | undefined {
  const match = VERSIONS_PATH_PATTERN.exec(path);
  const recordId = match?.[1];
  return recordId ? decodeURIComponent(recordId) : undefined;
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
