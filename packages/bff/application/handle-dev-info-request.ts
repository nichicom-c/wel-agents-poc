import type { DevInfoProvider } from "../contracts/dev-info.ts";
import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";

export type HandleDevInfoOptions = {
  authContext?: AuthenticatedUserContext;
  getDevInfo: DevInfoProvider;
};

export async function handleDevInfoRequest(
  request: BffHttpRequest,
  options: HandleDevInfoOptions,
): Promise<BffHttpResponse> {
  if (request.method !== "GET" || request.path !== "/api/dev-info") {
    return response(404, { error: "not found" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  return response(200, await options.getDevInfo());
}

function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}
