import { describe, expect, test } from "bun:test";

import { deriveRuntimeSessionId } from "../domain/auth.ts";
import { handleSessionsRequest } from "./handle-sessions-request.ts";

const CONVERSATION_ID = "chat-00000000-0000-4000-8000-000000000000";
const AUTH_CONTEXT = {
  actorId: "u-user-123",
  userId: "user-123",
};

describe("handleSessionsRequest", () => {
  test("認証済み actor の AgentCore sessions を conversationId 一覧に変換する", async () => {
    const runtimeSessionId = deriveRuntimeSessionId(
      AUTH_CONTEXT.userId,
      CONVERSATION_ID,
    );
    const response = await handleSessionsRequest(
      {
        method: "GET",
        path: "/api/sessions",
      },
      {
        authContext: AUTH_CONTEXT,
        listSessions: async (params) => {
          expect(params).toEqual({ actorId: "u-user-123" });
          return {
            memoryId: "memory-1",
            sessions: [
              {
                actorId: "u-user-123",
                createdAt: "2026-06-17T02:00:00.000Z",
                runtimeSessionId,
              },
              {
                actorId: "u-user-123",
                createdAt: "2026-06-17T01:00:00.000Z",
                runtimeSessionId: "other-user-session",
              },
            ],
            truncated: true,
          };
        },
        memoryId: "memory-1",
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      memoryId: "memory-1",
      sessions: [
        {
          conversationId: CONVERSATION_ID,
          createdAt: "2026-06-17T02:00:00.000Z",
        },
      ],
      truncated: true,
    });
  });

  test("認証コンテキストがなければ 401", async () => {
    const response = await handleSessionsRequest(
      {
        method: "GET",
        path: "/api/sessions",
      },
      {
        listSessions: async () => {
          throw new Error("must not be called");
        },
        memoryId: "memory-1",
      },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "authentication required",
    });
  });

  test("Memory ID がなければ AWS を呼ばず 503", async () => {
    const response = await handleSessionsRequest(
      {
        method: "GET",
        path: "/api/sessions",
      },
      {
        authContext: AUTH_CONTEXT,
        listSessions: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "AgentCore Memory ID is not configured",
    });
  });

  test("AWS error を 502 にする", async () => {
    const response = await handleSessionsRequest(
      {
        method: "GET",
        path: "/api/sessions",
      },
      {
        authContext: AUTH_CONTEXT,
        listSessions: async () => {
          throw new Error("AccessDeniedException");
        },
        logError: () => undefined,
        memoryId: "memory-1",
      },
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      error: "AgentCore sessions list failed",
    });
  });
});
