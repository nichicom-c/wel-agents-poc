import { describe, expect, test } from "bun:test";

import { handleTeachingMaterialRequest } from "./handle-teaching-material-request.ts";

const ACTOR_ID = "web-user";
const SESSION_ID = "teaching-00000000-0000-4000-8000-000000000000";

const MASTERS = {
  specialties: [{ id: "sp-adult", label: "成人保健" }],
  learningThemes: [{ id: "th-assessment", label: "アセスメント" }],
  difficultyLevels: [{ id: "df-basic", label: "基礎" }],
  rejectionReasonCodes: [{ code: "duplicate", label: "重複" }],
};

describe("handleTeachingMaterialRequest", () => {
  test("BFF request を runtime payload に変換し title/summary/learningObjective/teachingPoints を返す", async () => {
    let runtimeSessionId = "";
    let runtimePayload: unknown;

    const response = await handleTeachingMaterialRequest(
      {
        body: JSON.stringify({
          text: " 血圧が高いので食生活を見直すよう指導しました。 ",
        }),
        method: "POST",
        path: "/api/teaching-material-draft",
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
              type: "teaching_material",
              title: "血圧高値と生活背景の統合",
              summary: "単回の血圧高値から生活背景を確認せず指導へ進んだ場面",
              learningObjective:
                "不足情報を確認し、S/Oを関連付けてAssessmentできるようになる",
              teachingPoints: ["単回の測定値だけで結論を出さない"],
              specialtyId: "sp-adult",
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
      title: "血圧高値と生活背景の統合",
      summary: "単回の血圧高値から生活背景を確認せず指導へ進んだ場面",
      learningObjective:
        "不足情報を確認し、S/Oを関連付けてAssessmentできるようになる",
      teachingPoints: ["単回の測定値だけで結論を出さない"],
      specialtyId: "sp-adult",
    });
    expect(runtimeSessionId).toBe(SESSION_ID);
    expect(runtimePayload).toEqual({
      actor_id: ACTOR_ID,
      type: "teaching_material",
      text: "血圧が高いので食生活を見直すよう指導しました。",
      session_id: SESSION_ID,
    });
  });

  test("getMasters があれば分類の選択肢を runtime payload に載せる", async () => {
    let runtimePayload: Record<string, unknown> = {};

    await handleTeachingMaterialRequest(
      {
        body: JSON.stringify({ text: "x" }),
        method: "POST",
        path: "/api/teaching-material-draft",
      },
      {
        actorId: ACTOR_ID,
        createSessionId: () => SESSION_ID,
        getMasters: async () => MASTERS,
        invokeRuntime: async (_sessionId, payload) => {
          runtimePayload = payload as unknown as Record<string, unknown>;
          return { ok: true, payload: { status: "success" }, statusCode: 200 };
        },
      },
    );

    expect(runtimePayload.classification_options).toEqual({
      difficultyLevels: MASTERS.difficultyLevels,
      learningThemes: MASTERS.learningThemes,
      specialties: MASTERS.specialties,
    });
  });

  test("マスタ読み出しの失敗は生成を止めず、選択肢なしで呼ぶ", async () => {
    let runtimePayload: Record<string, unknown> = {};
    const logged: string[] = [];

    const response = await handleTeachingMaterialRequest(
      {
        body: JSON.stringify({ text: "x" }),
        method: "POST",
        path: "/api/teaching-material-draft",
      },
      {
        actorId: ACTOR_ID,
        createSessionId: () => SESSION_ID,
        getMasters: async () => {
          throw new Error("training data store unavailable");
        },
        invokeRuntime: async (_sessionId, payload) => {
          runtimePayload = payload as unknown as Record<string, unknown>;
          return {
            ok: true,
            payload: { status: "success", title: "t" },
            statusCode: 200,
          };
        },
        logError: (message) => logged.push(message),
      },
    );

    expect(response.statusCode).toBe(200);
    expect(runtimePayload).not.toHaveProperty("classification_options");
    expect(logged).toContain("teaching material masters lookup failed");
  });

  test("text 欠落は 400 にする", async () => {
    const response = await handleTeachingMaterialRequest(
      {
        body: JSON.stringify({}),
        method: "POST",
        path: "/api/teaching-material-draft",
      },
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
    const response = await handleTeachingMaterialRequest(
      { body: "{", method: "POST", path: "/api/teaching-material-draft" },
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
    const response = await handleTeachingMaterialRequest(
      {
        body: JSON.stringify({ text: "x" }),
        method: "POST",
        path: "/api/teaching-material-draft",
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
    const response = await handleTeachingMaterialRequest(
      {
        body: JSON.stringify({ text: "x" }),
        method: "POST",
        path: "/api/teaching-material-draft",
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
    const response = await handleTeachingMaterialRequest(
      { method: "OPTIONS", path: "/api/teaching-material-draft" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(204);
  });

  test("未知の path/method は 404 にする", async () => {
    const response = await handleTeachingMaterialRequest(
      { method: "GET", path: "/api/teaching-material-draft" },
      {
        actorId: ACTOR_ID,
        invokeRuntime: async () => ({ ok: true, payload: {}, statusCode: 200 }),
      },
    );

    expect(response.statusCode).toBe(404);
  });
});
