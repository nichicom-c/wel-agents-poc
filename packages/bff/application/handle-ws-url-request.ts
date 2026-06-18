import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import {
  type AuthenticatedUserContext,
  deriveRuntimeSessionId,
} from "../domain/auth.ts";
import { isRuntimeSessionId, textField } from "../domain/chat-session.ts";

const DEFAULT_WS_URL_EXPIRES_SECONDS = 300;
const CONVERSATION_ID_ERROR =
  "conversationId must be 33-256 chars, start with an alphanumeric character, and contain only A-Z, a-z, 0-9, _ or -";

export type WsUrlHttpRequest = BffHttpRequest & {
  headers?: Record<string, string | undefined>;
};

export type CreateWebSocketUrl = (params: {
  actorId: string;
  conversationId: string;
  expiresIn: number;
  qualifier?: string;
  runtimeSessionId: string;
  userId: string;
}) => Promise<string>;

export type HandleWsUrlOptions = {
  authContext?: AuthenticatedUserContext;
  createWebSocketUrl: CreateWebSocketUrl;
  expiresIn?: number;
  logError?: (message: string, detail: Record<string, unknown>) => void;
  qualifier?: string;
};

export async function handleWsUrlRequest(
  request: WsUrlHttpRequest,
  options: HandleWsUrlOptions,
): Promise<BffHttpResponse> {
  if (request.method !== "POST" || request.path !== "/api/ws-url") {
    return response(404, { error: "not found" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  let body: Record<string, unknown>;
  try {
    body = parseJsonBody(request);
  } catch {
    return response(400, { error: "request body must be valid JSON" });
  }

  const conversationId = textField(body.conversationId);
  if (!isRuntimeSessionId(conversationId)) {
    return response(400, { error: CONVERSATION_ID_ERROR });
  }

  const expiresIn = boundedExpiresIn(options.expiresIn);
  const runtimeSessionId = deriveRuntimeSessionId(
    options.authContext.userId,
    conversationId,
  );

  try {
    const webSocketUrl = await options.createWebSocketUrl({
      actorId: options.authContext.actorId,
      conversationId,
      expiresIn,
      ...(options.qualifier ? { qualifier: options.qualifier } : {}),
      runtimeSessionId,
      userId: options.authContext.userId,
    });
    return response(200, { conversationId, expiresIn, webSocketUrl });
  } catch (error) {
    options.logError?.("websocket url creation failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return response(500, { error: "WebSocket URL creation failed" });
  }
}

function parseJsonBody(request: BffHttpRequest): Record<string, unknown> {
  const rawBody = request.isBase64Encoded
    ? Buffer.from(request.body || "", "base64").toString("utf8")
    : request.body || "{}";
  const parsed: unknown = JSON.parse(rawBody);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function boundedExpiresIn(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_WS_URL_EXPIRES_SECONDS;
  }
  return Math.min(
    Math.max(Math.trunc(value), 1),
    DEFAULT_WS_URL_EXPIRES_SECONDS,
  );
}

function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}
