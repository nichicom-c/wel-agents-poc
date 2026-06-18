import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type { RuntimeInvoker, RuntimePayload } from "../contracts/runtime.ts";
import {
  createConversationId,
  isRuntimeSessionId,
  textField,
} from "../domain/chat-session.ts";

/** BFF core の依存。adapter ごとに actor ID / Runtime 呼び出し / logging を注入する。 */
export type HandleBffOptions = {
  /** RuntimePayload に埋め込む actor ID。 */
  actorId: string;
  /** AgentCore Runtime を呼び出す adapter 実装。 */
  invokeRuntime: RuntimeInvoker;
  /** 想定外 error の記録先。省略時は握りつぶして構造化 response のみ返す。 */
  logError?: (message: string, detail: Record<string, unknown>) => void;
};

/**
 * BFF の共通 request handling。
 *
 * adapter 由来の HTTP request を検証し、Chat UI の `message` / `conversationId` を
 * Runtime の `prompt` / `session_id` に変換する。Runtime 呼び出しの transport は
 * `options.invokeRuntime` に委譲するため、Lambda と local dev server で同じ挙動を共有できる。
 */
export async function handleBffRequest(
  request: BffHttpRequest,
  options: HandleBffOptions,
): Promise<BffHttpResponse> {
  try {
    if (request.method === "GET" && request.path === "/ping") {
      return response(200, {
        status: "healthy",
        time_of_last_update: Math.floor(Date.now() / 1000),
      });
    }

    if (request.method === "OPTIONS" && request.path === "/api/chat") {
      return response(204, {});
    }

    if (request.method !== "POST" || request.path !== "/api/chat") {
      return response(404, { error: "not found" });
    }

    const body = parseJsonBody(request);
    const message = textField(body.message || body.prompt);

    if (!message) {
      return response(400, { error: "message is required" });
    }

    const conversationId =
      textField(body.conversationId || body.session_id || body.sessionId) ||
      createConversationId();

    if (!isRuntimeSessionId(conversationId)) {
      return response(400, {
        error:
          "conversationId must be 33-256 chars, start with an alphanumeric character, and contain only A-Z, a-z, 0-9, _ or -",
      });
    }

    const runtimePayload: RuntimePayload = {
      actor_id: options.actorId,
      prompt: message,
      session_id: conversationId,
    };

    const runtimeResponse = await options.invokeRuntime(
      conversationId,
      runtimePayload,
    );

    if (!runtimeResponse.ok) {
      return response(502, {
        error: "AgentCore invoke failed",
        message: runtimeResponse.body,
        statusCode: runtimeResponse.statusCode,
      });
    }

    return response(200, {
      conversationId,
      response: extractResponseText(runtimeResponse.payload),
      runtime: runtimeResponse.payload,
    });
  } catch (error) {
    const statusCode =
      error instanceof Error && error.name === "AbortError"
        ? 504
        : error instanceof BadRequestError
          ? 400
          : 500;

    if (!(error instanceof BadRequestError)) {
      options.logError?.("bff request failed", {
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

/** Runtime payload から Chat UI に表示する代表テキストを best-effort で取り出す。 */
function extractResponseText(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  const record = asRecord(payload);

  if (typeof record.response === "string") {
    return record.response;
  }

  if (record.response !== undefined) {
    return JSON.stringify(record.response);
  }

  if (typeof record.answer === "string") {
    return record.answer;
  }

  if (typeof record.message === "string") {
    return record.message;
  }

  return JSON.stringify(payload);
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
