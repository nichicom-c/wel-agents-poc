import { describe, expect, test } from "bun:test";

import { handleBffRequest } from "./handle-request.ts";

const ACTOR_ID = "web-user";
const CONVERSATION_ID = "chat-00000000-0000-4000-8000-000000000000";

describe("handleBffRequest", () => {
  test("BFF request を runtime payload に変換する", async () => {
    let runtimeSessionId = "";
    let runtimePayload: unknown;

    const response = await handleBffRequest(
      {
        body: JSON.stringify({
          conversationId: CONVERSATION_ID,
          message: " hello ",
        }),
        method: "POST",
        path: "/api/chat",
      },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async (sessionId, payload) => {
          runtimeSessionId = sessionId;
          runtimePayload = payload;
          return {
            ok: true,
            payload: { response: "answer", status: "success" },
            statusCode: 200,
          };
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      conversationId: CONVERSATION_ID,
      response: "answer",
      runtime: { response: "answer", status: "success" },
    });
    expect(runtimeSessionId).toBe(CONVERSATION_ID);
    expect(runtimePayload).toEqual({
      actor_id: ACTOR_ID,
      prompt: "hello",
      session_id: CONVERSATION_ID,
    });
  });

  test("壊れた JSON は 400 にする", async () => {
    const response = await handleBffRequest(
      {
        body: "{",
        method: "POST",
        path: "/api/chat",
      },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "request body must be valid JSON",
    });
  });

  test("runtime error は BFF の 502 にする", async () => {
    const response = await handleBffRequest(
      {
        body: JSON.stringify({
          conversationId: CONVERSATION_ID,
          message: "hello",
        }),
        method: "POST",
        path: "/api/chat",
      },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({
          body: "upstream failed",
          ok: false,
          statusCode: 503,
        }),
      },
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      error: "AgentCore invoke failed",
      message: "upstream failed",
      statusCode: 503,
    });
  });
});
