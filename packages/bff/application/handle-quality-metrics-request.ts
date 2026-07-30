import type { QualityMetricDefinition } from "../contracts/admin.ts";
import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const COLLECTION_PATH = "/api/quality-metrics";

/** BFF core の依存。adapter ごとに RDS Data API 呼び出しの実装を注入する。 */
export type HandleQualityMetricsOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401。 */
  authContext?: AuthenticatedUserContext;
  listMetrics: () => Promise<QualityMetricDefinition[]>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * 品質指標（issue #10）の BFF handler。目標値・合格ラインの設定は Out of Scope のため
 * `GET /api/quality-metrics` の定義一覧の read のみ担う。
 */
export async function handleQualityMetricsRequest(
  request: BffHttpRequest,
  options: HandleQualityMetricsOptions,
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

  if (request.method !== "GET") {
    return response(404, { error: "not found" });
  }

  try {
    const metrics = await options.listMetrics();
    return response(200, { metrics });
  } catch (error) {
    options.logError?.("quality metrics request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "quality metrics request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
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
