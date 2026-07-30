import { describe, expect, test } from "bun:test";

import {
  type HandleRubricOptions,
  handleRubricRequest,
} from "./handle-rubric-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const SAMPLE_RUBRIC = {
  createdAt: "2026-07-18T09:00:00.000Z",
  createdBy: AUTH_CONTEXT.userId,
  id: "rubric-1",
  items: [],
  name: "name text",
  reviewStatus: "expert_review_required" as const,
  targetType: "exercise_feedback" as const,
  versionNo: 1,
};

function baseOptions(
  overrides: Partial<HandleRubricOptions> = {},
): HandleRubricOptions {
  return {
    authContext: AUTH_CONTEXT,
    createRubric: async () => SAMPLE_RUBRIC,
    listRubrics: async () => [],
    setReviewStatus: async () => ({
      ...SAMPLE_RUBRIC,
      reviewStatus: "confirmed",
    }),
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleRubricRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleRubricRequest(
      { method: "OPTIONS", path: "/api/rubrics" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleRubricRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleRubricRequest(
      { method: "GET", path: "/api/rubrics" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleRubricRequest(
      { method: "GET", path: "/api/rubrics" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("POST /api/rubrics", () => {
    test("有効な body でルーブリックを作り、authContext から createdBy を使う", async () => {
      let capturedInput: unknown;
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({
            name: "name text",
            targetType: "exercise_feedback",
          }),
          method: "POST",
          path: "/api/rubrics",
        },
        baseOptions({
          createRubric: async (input) => {
            capturedInput = input;
            return SAMPLE_RUBRIC;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        createdBy: AUTH_CONTEXT.userId,
        createdByDisplayName: AUTH_CONTEXT.displayName,
        name: "name text",
        targetType: "exercise_feedback",
      });
    });

    test("targetType が不正なら 400 を返す", async () => {
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({ name: "name text", targetType: "x" }),
          method: "POST",
          path: "/api/rubrics",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/rubrics/:id/review-status", () => {
    test("有効な body で review status を変更する", async () => {
      let capturedInput: unknown;
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({ reviewStatus: "confirmed" }),
          method: "PATCH",
          path: "/api/rubrics/rubric-1/review-status",
        },
        baseOptions({
          setReviewStatus: async (input) => {
            capturedInput = input;
            return { ...SAMPLE_RUBRIC, reviewStatus: "confirmed" };
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        id: "rubric-1",
        nextStatus: "confirmed",
      });
    });

    test("不正な reviewStatus は 400 を返す", async () => {
      const response = await handleRubricRequest(
        {
          body: JSON.stringify({ reviewStatus: "x" }),
          method: "PATCH",
          path: "/api/rubrics/rubric-1/review-status",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });
});
