import { describe, expect, test } from "bun:test";

import {
  type CreateWebSocketUrl,
  handleWsUrlRequest,
} from "./handle-ws-url-request.ts";

const CONVERSATION_ID = "chat-00000000-0000-4000-8000-000000000000";
const AUTH_CONTEXT = {
  actorId: "u-user-123",
  displayName: "user@example.com",
  userId: "user-123",
};

describe("handleWsUrlRequest", () => {
  test("auth context があれば user-scoped session で WebSocket URL を返す", async () => {
    let presignInput: Parameters<CreateWebSocketUrl>[0] | undefined;

    const response = await handleWsUrlRequest(
      {
        body: JSON.stringify({ conversationId: CONVERSATION_ID }),
        method: "POST",
        path: "/api/ws-url",
      },
      {
        authContext: AUTH_CONTEXT,
        createWebSocketUrl: async (input) => {
          presignInput = input;
          return `wss://example.test/ws?session=${input.runtimeSessionId}&exp=${input.expiresIn}`;
        },
        expiresIn: 300,
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      conversationId: CONVERSATION_ID,
      expiresIn: 300,
      webSocketUrl: expect.stringMatching(
        /^wss:\/\/example\.test\/ws\?session=u[A-Za-z0-9_-]+-chat-.+&exp=300$/,
      ),
    });
    expect(presignInput).toEqual({
      actorId: "u-user-123",
      conversationId: CONVERSATION_ID,
      expiresIn: 300,
      runtimeSessionId: expect.stringMatching(/^u[A-Za-z0-9_-]+-chat-/),
      userId: "user-123",
    });
  });

  test("auth context がなければ 401", async () => {
    const response = await handleWsUrlRequest(
      {
        body: JSON.stringify({ conversationId: CONVERSATION_ID }),
        method: "POST",
        path: "/api/ws-url",
      },
      {
        createWebSocketUrl: async () => "wss://example.test/ws",
        expiresIn: 300,
      },
    );

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "authentication required",
    });
  });

  test("不正な conversationId は 400", async () => {
    const response = await handleWsUrlRequest(
      {
        body: JSON.stringify({ conversationId: "short" }),
        headers: { authorization: "Bearer test-token" },
        method: "POST",
        path: "/api/ws-url",
      },
      {
        authContext: AUTH_CONTEXT,
        createWebSocketUrl: async () => "wss://example.test/ws",
        expiresIn: 300,
      },
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error:
        "conversationId must be 33-256 chars, start with an alphanumeric character, and contain only A-Z, a-z, 0-9, _ or -",
    });
  });

  test("auth context があれば追加の issuer secret は不要", async () => {
    const response = await handleWsUrlRequest(
      {
        body: JSON.stringify({ conversationId: CONVERSATION_ID }),
        method: "POST",
        path: "/api/ws-url",
      },
      {
        authContext: AUTH_CONTEXT,
        createWebSocketUrl: async () => "wss://example.test/ws",
        expiresIn: 300,
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      conversationId: CONVERSATION_ID,
      expiresIn: 300,
      webSocketUrl: "wss://example.test/ws",
    });
  });
});
