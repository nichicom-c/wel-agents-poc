import { describe, expect, test } from "bun:test";

import { handleSoapGapsChatRequest } from "./handle-soap-gaps-chat-request.ts";

const ACTOR_ID = "web-user";
const CONVERSATION_ID = "chat-00000000-0000-4000-8000-000000000000";

const CANDIDATE = {
  category: "A",
  draftText: "転倒リスクが高い。",
  evidenceQuote: "転倒リスクが高い",
  reasoning: "観察結果からの評価。",
  confidence: 0.8,
};

const GAP = {
  gapType: "insufficient_reasoning",
  soapCategory: "A",
  targetItem: "転倒リスクが高い。",
  detail: "アセスメントの根拠が不足しています。",
  relatedEvidenceQuotes: ["転倒リスクが高い"],
  skippable: false,
};

describe("handleSoapGapsChatRequest", () => {
  test("初回ターン（message なし）は runtime payload に変換する", async () => {
    let runtimeSessionId = "";
    let runtimePayload: unknown;

    const response = await handleSoapGapsChatRequest(
      {
        body: JSON.stringify({ candidates: [CANDIDATE], gap: GAP }),
        method: "POST",
        path: "/api/soap-gaps-chat",
      },
      {
        actorId: ACTOR_ID,
        createConversationId: () => CONVERSATION_ID,
        invokeRuntime: async (sessionId, payload) => {
          runtimeSessionId = sessionId;
          runtimePayload = payload;
          return {
            ok: true,
            payload: {
              status: "success",
              type: "soap_gaps_chat",
              message: "転倒リスクの根拠となる具体的な様子はありましたか？",
              suggestions: ["ふらつきが見られた", "杖を使い始めた"],
              resolved: false,
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
      conversationId: CONVERSATION_ID,
      message: "転倒リスクの根拠となる具体的な様子はありましたか？",
      suggestions: ["ふらつきが見られた", "杖を使い始めた"],
      resolved: false,
    });
    expect(runtimeSessionId).toBe(CONVERSATION_ID);
    expect(runtimePayload).toEqual({
      actor_id: ACTOR_ID,
      type: "soap_gaps_chat",
      candidates: [CANDIDATE],
      gap: GAP,
      session_id: CONVERSATION_ID,
    });
  });

  test("message ありのターンは payload に含めて渡し、resolved/candidateText を返す", async () => {
    let runtimePayload: unknown;

    const response = await handleSoapGapsChatRequest(
      {
        body: JSON.stringify({
          candidates: [CANDIDATE],
          gap: GAP,
          conversationId: CONVERSATION_ID,
          message: "訪問時にふらついていました",
        }),
        method: "POST",
        path: "/api/soap-gaps-chat",
      },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async (_sessionId, payload) => {
          runtimePayload = payload;
          return {
            ok: true,
            payload: {
              status: "success",
              type: "soap_gaps_chat",
              message: "ありがとうございます。反映しますね。",
              suggestions: [],
              resolved: true,
              candidateText: "訪問時にふらつきが見られた。",
              session_id: CONVERSATION_ID,
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
      conversationId: CONVERSATION_ID,
      message: "ありがとうございます。反映しますね。",
      suggestions: [],
      resolved: true,
      candidateText: "訪問時にふらつきが見られた。",
    });
    expect(runtimePayload).toEqual({
      actor_id: ACTOR_ID,
      type: "soap_gaps_chat",
      candidates: [CANDIDATE],
      gap: GAP,
      session_id: CONVERSATION_ID,
      message: "訪問時にふらついていました",
    });
  });

  test("candidates 欠落は 400 にする", async () => {
    const response = await handleSoapGapsChatRequest(
      {
        body: JSON.stringify({ gap: GAP }),
        method: "POST",
        path: "/api/soap-gaps-chat",
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
      error: "candidates is required",
    });
  });

  test("gap 欠落・不正な形状は 400 にする", async () => {
    const missing = await handleSoapGapsChatRequest(
      {
        body: JSON.stringify({ candidates: [CANDIDATE] }),
        method: "POST",
        path: "/api/soap-gaps-chat",
      },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => {
          throw new Error("must not be called");
        },
      },
    );
    expect(missing.statusCode).toBe(400);
    expect(JSON.parse(missing.body)).toEqual({ error: "gap is required" });

    const invalid = await handleSoapGapsChatRequest(
      {
        body: JSON.stringify({
          candidates: [CANDIDATE],
          gap: { ...GAP, relatedEvidenceQuotes: [] },
        }),
        method: "POST",
        path: "/api/soap-gaps-chat",
      },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => {
          throw new Error("must not be called");
        },
      },
    );
    expect(invalid.statusCode).toBe(400);
  });

  test("不正な conversationId は 400 にする", async () => {
    const response = await handleSoapGapsChatRequest(
      {
        body: JSON.stringify({
          candidates: [CANDIDATE],
          gap: GAP,
          conversationId: "short",
        }),
        method: "POST",
        path: "/api/soap-gaps-chat",
      },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => {
          throw new Error("must not be called");
        },
      },
    );

    expect(response.statusCode).toBe(400);
  });

  test("壊れた JSON は 400 にする", async () => {
    const response = await handleSoapGapsChatRequest(
      { body: "{", method: "POST", path: "/api/soap-gaps-chat" },
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
    const response = await handleSoapGapsChatRequest(
      {
        body: JSON.stringify({ candidates: [CANDIDATE], gap: GAP }),
        method: "POST",
        path: "/api/soap-gaps-chat",
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
    const response = await handleSoapGapsChatRequest(
      {
        body: JSON.stringify({ candidates: [CANDIDATE], gap: GAP }),
        method: "POST",
        path: "/api/soap-gaps-chat",
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
    const response = await handleSoapGapsChatRequest(
      { method: "OPTIONS", path: "/api/soap-gaps-chat" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(204);
  });

  test("未知の path/method は 404 にする", async () => {
    const response = await handleSoapGapsChatRequest(
      { method: "GET", path: "/api/soap-gaps-chat" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(404);
  });
});
