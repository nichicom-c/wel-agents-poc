import type {
  MappingDefinition,
  SoapMappingVersion,
} from "../contracts/admin.ts";
import { MAPPING_CATEGORIES } from "../contracts/admin.ts";
import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import {
  isSoapRecordType,
  type SoapRecordType,
} from "../contracts/soap-records.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/soap-mapping-versions";

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleSoapMappingOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401（`created_by` に必要）。 */
  authContext?: AuthenticatedUserContext;
  listVersions: (input: {
    recordType: SoapRecordType;
  }) => Promise<SoapMappingVersion[]>;
  createVersion: (input: {
    recordType: SoapRecordType;
    mappingDefinition: MappingDefinition;
    createdBy: string;
    createdByDisplayName?: string;
  }) => Promise<SoapMappingVersion[]>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * SOAP マッピング（issue #10）の BFF handler。
 *
 * `GET /api/soap-mapping-versions?recordType=...` は記録種別ごとのバージョン履歴、
 * `POST /api/soap-mapping-versions` は新規バージョンの作成を担う。変更は既存記録へ即時反映
 * せず新規解析から適用する（issue #10 の Technical Approach）ため、作成時に既存の
 * `soap_record_versions` を書き換えることはしない。
 */
export async function handleSoapMappingRequest(
  request: BffHttpRequest,
  options: HandleSoapMappingOptions,
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
    if (request.method === "GET") {
      const recordType = request.query?.recordType;
      if (!isSoapRecordType(recordType)) {
        throw new BadRequestError(
          "recordType query must be a valid SOAP record type",
        );
      }
      const versions = await options.listVersions({ recordType });
      return response(200, { versions });
    }

    if (request.method === "POST") {
      return await handleCreate(request, authContext, options);
    }

    return response(404, { error: "not found" });
  } catch (error) {
    if (error instanceof BadRequestError) {
      return response(400, { error: error.message });
    }

    options.logError?.("soap mapping request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "soap mapping request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleCreate(
  request: BffHttpRequest,
  authContext: AuthenticatedUserContext,
  options: HandleSoapMappingOptions,
): Promise<BffHttpResponse> {
  const body = parseJsonBody(request);

  const recordType = body.recordType;
  if (!isSoapRecordType(recordType)) {
    throw new BadRequestError("recordType must be a valid SOAP record type");
  }

  const mappingDefinition = mappingDefinitionFromBody(body.mappingDefinition);

  const versions = await options.createVersion({
    createdBy: authContext.userId,
    createdByDisplayName: authContext.displayName,
    mappingDefinition,
    recordType,
  });

  return response(200, { versions });
}

function mappingDefinitionFromBody(value: unknown): MappingDefinition {
  const record = asRecord(value);
  const result: Partial<MappingDefinition> = {};
  for (const category of MAPPING_CATEGORIES) {
    const text = textField(record[category]);
    if (!text) {
      throw new BadRequestError(`mappingDefinition.${category} is required`);
    }
    result[category] = text;
  }
  return result as MappingDefinition;
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
