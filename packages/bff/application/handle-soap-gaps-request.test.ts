import { describe, expect, test } from "bun:test";

import { handleSoapGapsRequest } from "./handle-soap-gaps-request.ts";

const ACTOR_ID = "web-user";
const SESSION_ID = "soap-gaps-00000000-0000-4000-8000-000000000000";

const CANDIDATE = {
  category: "A",
  draftText: "転倒リスクが高い。",
  evidenceQuote: "転倒リスクが高い",
  reasoning: "観察結果からの評価。",
  confidence: 0.8,
};

describe("handleSoapGapsRequest", () => {
  test("BFF request を runtime payload に変換し gaps/questions を返す", async () => {
    let runtimeSessionId = "";
    let runtimePayload: unknown;

    const response = await handleSoapGapsRequest(
      {
        body: JSON.stringify({ candidates: [CANDIDATE] }),
        method: "POST",
        path: "/api/soap-gaps",
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
              type: "soap_gaps",
              gaps: [
                {
                  gapType: "insufficient_reasoning",
                  soapCategory: "A",
                  targetItem: "転倒リスクが高い。",
                  detail: "根拠となる S/O が見当たりません。",
                  relatedEvidenceQuotes: ["転倒リスクが高い"],
                  skippable: false,
                },
              ],
              questions: [
                {
                  gapType: "insufficient_reasoning",
                  soapCategory: "A",
                  targetItem: "転倒リスクが高い。",
                  questionText: "転倒リスクの根拠となる様子はありましたか？",
                  skippable: false,
                },
              ],
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
      gaps: [
        {
          gapType: "insufficient_reasoning",
          soapCategory: "A",
          targetItem: "転倒リスクが高い。",
          detail: "根拠となる S/O が見当たりません。",
          relatedEvidenceQuotes: ["転倒リスクが高い"],
          skippable: false,
        },
      ],
      questions: [
        {
          gapType: "insufficient_reasoning",
          soapCategory: "A",
          targetItem: "転倒リスクが高い。",
          questionText: "転倒リスクの根拠となる様子はありましたか？",
          skippable: false,
        },
      ],
    });
    expect(runtimeSessionId).toBe(SESSION_ID);
    expect(runtimePayload).toEqual({
      actor_id: ACTOR_ID,
      type: "soap_gaps",
      candidates: [CANDIDATE],
      session_id: SESSION_ID,
    });
  });

  test("candidates 欠落は 400 にする", async () => {
    const response = await handleSoapGapsRequest(
      { body: JSON.stringify({}), method: "POST", path: "/api/soap-gaps" },
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

  test("candidates が空配列なら 400 にする", async () => {
    const response = await handleSoapGapsRequest(
      {
        body: JSON.stringify({ candidates: [] }),
        method: "POST",
        path: "/api/soap-gaps",
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

  test("不正な候補（category 不正や draftText 欠落）が混ざっていれば 400 にする", async () => {
    const response = await handleSoapGapsRequest(
      {
        body: JSON.stringify({
          candidates: [CANDIDATE, { category: "X", draftText: "bad" }],
        }),
        method: "POST",
        path: "/api/soap-gaps",
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
    const response = await handleSoapGapsRequest(
      { body: "{", method: "POST", path: "/api/soap-gaps" },
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
    const response = await handleSoapGapsRequest(
      {
        body: JSON.stringify({ candidates: [CANDIDATE] }),
        method: "POST",
        path: "/api/soap-gaps",
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
    const response = await handleSoapGapsRequest(
      {
        body: JSON.stringify({ candidates: [CANDIDATE] }),
        method: "POST",
        path: "/api/soap-gaps",
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
    const response = await handleSoapGapsRequest(
      { method: "OPTIONS", path: "/api/soap-gaps" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(204);
  });

  test("未知の path/method は 404 にする", async () => {
    const response = await handleSoapGapsRequest(
      { method: "GET", path: "/api/soap-gaps" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(404);
  });
});
