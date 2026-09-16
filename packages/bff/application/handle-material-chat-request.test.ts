import { describe, expect, test } from "bun:test";

import { handleMaterialChatRequest } from "./handle-material-chat-request.ts";

const ACTOR_ID = "web-user";
const SESSION_ID = "material-chat-00000000-0000-4000-8000-000000000000";

describe("handleMaterialChatRequest", () => {
  test("material / teachingPoint / history / message を runtime payload に変換し message/suggestions/resolved を返す", async () => {
    let runtimeSessionId = "";
    let runtimePayload: unknown;

    const response = await handleMaterialChatRequest(
      {
        body: JSON.stringify({
          history: [{ role: "assistant", text: "こんにちは" }],
          material: {
            learningObjective: " 学習目標 ",
            teachingPoints: ["ポイント1", " "],
            title: " 教材タイトル ",
          },
          message: " 質問です ",
          teachingPoint: " ポイント1 ",
        }),
        method: "POST",
        path: "/api/material-chat",
      },
      {
        actorId: ACTOR_ID,
        createSessionId: () => SESSION_ID,
        invokeRuntime: async (sessionId, payload) => {
          runtimeSessionId = sessionId;
          runtimePayload = payload;
          return {
            ok: true,
            payload: {
              actor_id: ACTOR_ID,
              message: "応答本文",
              model_id: "test-model",
              resolved: true,
              session_id: sessionId,
              status: "success",
              suggestions: ["視点1"],
              type: "material_chat",
            },
            statusCode: 200,
          };
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      message: "応答本文",
      resolved: true,
      suggestions: ["視点1"],
    });
    expect(runtimeSessionId).toBe(SESSION_ID);
    expect(runtimePayload).toEqual({
      actor_id: ACTOR_ID,
      history: [{ role: "assistant", text: "こんにちは" }],
      material: {
        learningObjective: "学習目標",
        teachingPoints: ["ポイント1"],
        title: "教材タイトル",
      },
      message: "質問です",
      session_id: SESSION_ID,
      teaching_point: "ポイント1",
      type: "material_chat",
    });
  });

  test("material.title 欠落は 400 にする", async () => {
    const response = await handleMaterialChatRequest(
      {
        body: JSON.stringify({ material: {} }),
        method: "POST",
        path: "/api/material-chat",
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
      error: "material.title is required",
    });
  });

  test("壊れた JSON は 400 にする", async () => {
    const response = await handleMaterialChatRequest(
      { body: "{", method: "POST", path: "/api/material-chat" },
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

  test("runtime の transport error は 502 にする", async () => {
    const response = await handleMaterialChatRequest(
      {
        body: JSON.stringify({ material: { title: "教材タイトル" } }),
        method: "POST",
        path: "/api/material-chat",
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

  test("AgentCore 内部の error status も 502 にする", async () => {
    const response = await handleMaterialChatRequest(
      {
        body: JSON.stringify({ material: { title: "教材タイトル" } }),
        method: "POST",
        path: "/api/material-chat",
      },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({
          ok: true,
          payload: {
            status: "error",
            error: "Missing required configuration: BEDROCK_MODEL_ID",
          },
          statusCode: 200,
        }),
      },
    );

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({
      error: "AgentCore invoke failed",
      message: "Missing required configuration: BEDROCK_MODEL_ID",
    });
  });

  test("OPTIONS は 204 を返す", async () => {
    const response = await handleMaterialChatRequest(
      { method: "OPTIONS", path: "/api/material-chat" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(204);
  });

  test("未知の path/method は 404 にする", async () => {
    const response = await handleMaterialChatRequest(
      { method: "GET", path: "/api/material-chat" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(404);
  });
});
