import type { BffHttpRequest, BffHttpResponse } from "../contracts/http.ts";
import { BFF_JSON_HEADERS } from "../contracts/http.ts";
import type {
  AgentCoreSessionsResult,
  BffSessionSummary,
} from "../contracts/sessions.ts";
import type { AuthenticatedUserContext } from "../domain/auth.ts";
import { conversationIdFromRuntimeSessionId } from "../domain/chat-session.ts";

export type ListSessions = (params: {
  actorId: string;
}) => Promise<AgentCoreSessionsResult>;

export type HandleSessionsOptions = {
  authContext?: AuthenticatedUserContext;
  listSessions: ListSessions;
  logError?: (message: string, detail: Record<string, unknown>) => void;
  memoryId?: string;
};

export async function handleSessionsRequest(
  request: BffHttpRequest,
  options: HandleSessionsOptions,
): Promise<BffHttpResponse> {
  if (request.method !== "GET" || request.path !== "/api/sessions") {
    return response(404, { error: "not found" });
  }

  if (!options.authContext) {
    return response(401, { error: "authentication required" });
  }

  if (!options.memoryId) {
    return response(503, {
      error: "AgentCore Memory ID is not configured",
    });
  }

  try {
    const result = await options.listSessions({
      actorId: options.authContext.actorId,
    });

    return response(200, {
      memoryId: result.memoryId,
      sessions: sessionsForUser(options.authContext.userId, result),
      truncated: result.truncated,
    });
  } catch (error) {
    options.logError?.("agentcore sessions list failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
    });
    return response(502, { error: "AgentCore sessions list failed" });
  }
}

function sessionsForUser(
  userId: string,
  result: AgentCoreSessionsResult,
): BffSessionSummary[] {
  return result.sessions.flatMap((session) => {
    const conversationId = conversationIdFromRuntimeSessionId(
      userId,
      session.runtimeSessionId,
    );

    if (!conversationId) {
      return [];
    }

    return [
      {
        conversationId,
        createdAt: session.createdAt,
      },
    ];
  });
}

function response(statusCode: number, body: unknown): BffHttpResponse {
  return {
    body: JSON.stringify(body),
    headers: BFF_JSON_HEADERS,
    isBase64Encoded: false,
    statusCode,
  };
}
