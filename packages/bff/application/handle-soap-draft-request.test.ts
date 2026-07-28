import { describe, expect, test } from "bun:test";

import { handleSoapDraftRequest } from "./handle-soap-draft-request.ts";

const ACTOR_ID = "web-user";
const SESSION_ID = "soap-00000000-0000-4000-8000-000000000000";

describe("handleSoapDraftRequest", () => {
  test("BFF request を runtime payload に変換し candidates を返す", async () => {
    let runtimeSessionId = "";
    let runtimePayload: unknown;

    const response = await handleSoapDraftRequest(
      {
        body: JSON.stringify({
          text: " 最近眠れていない ",
        }),
        method: "POST",
        path: "/api/soap-draft",
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
              status: "success",
              type: "soap_draft",
              candidates: [
                {
                  category: "S",
                  draftText: "draft",
                  evidenceQuote: "最近眠れていない",
                  reasoning: "reason",
                  confidence: 0.8,
                },
              ],
              recommendedRecordTypes: ["support_activity"],
              session_id: sessionId,
              actor_id: ACTOR_ID,
              model_id: "test-model",
            },
            statusCode: 200,
          };
        },
      },
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      candidates: [
        {
          category: "S",
          draftText: "draft",
          evidenceQuote: "最近眠れていない",
          reasoning: "reason",
          confidence: 0.8,
        },
      ],
      recommendedRecordTypes: ["support_activity"],
    });
    expect(runtimeSessionId).toBe(SESSION_ID);
    expect(runtimePayload).toEqual({
      actor_id: ACTOR_ID,
      type: "soap_draft",
      text: "最近眠れていない",
      session_id: SESSION_ID,
    });
  });

  test("text 欠落は 400 にする", async () => {
    const response = await handleSoapDraftRequest(
      { body: JSON.stringify({}), method: "POST", path: "/api/soap-draft" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: "text is required" });
  });

  test("壊れた JSON は 400 にする", async () => {
    const response = await handleSoapDraftRequest(
      { body: "{", method: "POST", path: "/api/soap-draft" },
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
    const response = await handleSoapDraftRequest(
      {
        body: JSON.stringify({ text: "x" }),
        method: "POST",
        path: "/api/soap-draft",
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
    const response = await handleSoapDraftRequest(
      {
        body: JSON.stringify({ text: "x" }),
        method: "POST",
        path: "/api/soap-draft",
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
    const response = await handleSoapDraftRequest(
      { method: "OPTIONS", path: "/api/soap-draft" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(204);
  });

  test("未知の path/method は 404 にする", async () => {
    const response = await handleSoapDraftRequest(
      { method: "GET", path: "/api/soap-draft" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(404);
  });
});
