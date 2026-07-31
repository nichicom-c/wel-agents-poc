import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

const STATUS_PATH = "/api/training-data-cluster";
const START_PATH = "/api/training-data-cluster/start";

export type HandleTrainingDataClusterOptions = {
  /** JWT claims から導出した認証済み user context。無ければ 401。 */
  authContext?: AuthenticatedUserContext;
  getClusterStatus: () => Promise<string>;
  startCluster: () => Promise<string>;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** Training Data Store（Aurora）の cluster ARN が設定済みかどうか。未設定なら 503 を返す。 */
  trainingDataConfigured?: boolean;
};

/**
 * Training Data Store（Aurora Serverless v2）の cluster を起動する BFF handler。
 *
 * scale-to-zero の自動 pause と違い、手動で stop した cluster は Data API 呼び出しでは
 * 復帰しないため、開発者が毎回 `aws rds start-db-cluster` を叩く代わりに UI から
 * `GET /api/training-data-cluster`（現在の status）/ `POST /api/training-data-cluster/start`
 * （起動を要求）を呼べるようにする。
 */
export async function handleTrainingDataClusterRequest(
  request: BffHttpRequest,
  options: HandleTrainingDataClusterOptions,
): Promise<BffHttpResponse> {
  if (request.method === "OPTIONS" && isTrainingDataClusterPath(request.path)) {
    return response(204, {});
  }

  if (!isTrainingDataClusterPath(request.path)) {
    return response(404, { error: "not found" });
  }

  if (!options.trainingDataConfigured) {
    return response(503, { error: "training data store is not configured" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  try {
    if (request.method === "GET" && request.path === STATUS_PATH) {
      return response(200, { status: await options.getClusterStatus() });
    }

    if (request.method === "POST" && request.path === START_PATH) {
      return response(200, { status: await options.startCluster() });
    }

    return response(404, { error: "not found" });
  } catch (error) {
    options.logError?.("training data cluster request failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      path: request.path,
    });

    return response(502, {
      error: "training data cluster request failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function isTrainingDataClusterPath(path: string): boolean {
  return path === STATUS_PATH || path === START_PATH;
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
