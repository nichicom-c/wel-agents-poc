import { randomUUID } from "node:crypto";

import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { RuntimeInvoker, RuntimePayload } from "../contracts/runtime.ts";
import { textField } from "../domain/chat-session.ts";

/** BFF core の依存。adapter ごとに actor ID / Runtime 呼び出し / logging を注入する。 */
export type HandleSoapDraftOptions = {
  /** RuntimePayload に埋め込む actor ID。 */
  actorId: string;
  /** AgentCore Runtime を呼び出す adapter 実装。 */
  invokeRuntime: RuntimeInvoker;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
  /** runtime session ID 生成（テスト用。省略時は randomUUID）。 */
  createSessionId?: () => string;
};

/**
 * SOAP Studio の「SOAP 下書き生成」画面が呼ぶ BFF handler。
 *
 * 会話ではなく stateless な一回限りの分類リクエストなので、client からの conversationId は
 * 受け取らず、呼び出しごとに新しい runtime session ID を生成して AgentCore Runtime へ渡す。
 * `invokeRuntime` は `/api/chat` と同じ seam を再利用する（transport は agnostic）。
 */
export async function handleSoapDraftRequest(
  request: BffHttpRequest,
  options: HandleSoapDraftOptions,
): Promise<BffHttpResponse> {
  try {
    if (request.method === "OPTIONS" && request.path === "/api/soap-draft") {
      return response(204, {});
    }

    if (request.method !== "POST" || request.path !== "/api/soap-draft") {
      return response(404, { error: "not found" });
    }

    const body = parseJsonBody(request);
    const text = textField(body.text);

    if (!text) {
      return response(400, { error: "text is required" });
    }

    const sessionId = (options.createSessionId ?? randomUUID)();

    const runtimePayload: RuntimePayload = {
      actor_id: options.actorId,
      type: "soap_draft",
      text,
      session_id: sessionId,
    };

    const runtimeResponse = await options.invokeRuntime(
      sessionId,
      runtimePayload,
    );

    if (!runtimeResponse.ok) {
      return response(502, {
        error: "AgentCore invoke failed",
        message: runtimeResponse.body,
        statusCode: runtimeResponse.statusCode,
      });
    }

    const payload = asRecord(runtimeResponse.payload);

    if (payload.status === "error") {
      return response(502, {
        error: "AgentCore invoke failed",
        message:
          typeof payload.error === "string" ? payload.error : "unknown error",
      });
    }

    return response(200, {
      candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
      recommendedRecordTypes: Array.isArray(payload.recommendedRecordTypes)
        ? payload.recommendedRecordTypes
        : [],
    });
  } catch (error) {
    const statusCode =
      error instanceof Error && error.name === "AbortError"
        ? 504
        : error instanceof BadRequestError
          ? 400
          : 500;

    if (!(error instanceof BadRequestError)) {
      options.logError?.("soap draft request failed", {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
      });
    }

    return response(statusCode, {
      error:
        error instanceof BadRequestError
          ? error.message
          : statusCode === 504
            ? "AgentCore invoke timed out"
            : "internal server error",
    });
  }
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

/** Lambda 互換の JSON response を組み立てる。 */
function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}

/** unknown 値が plain object のときだけ record として扱う。 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** request body など client 起因の 400 に変換する error。 */
class BadRequestError extends Error {
  override name = "BadRequestError";
}
