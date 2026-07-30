import { describe, expect, test } from "bun:test";

import {
  type HandleExerciseCaseOptions,
  handleExerciseCaseRequest,
} from "./handle-exercise-case-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const SAMPLE_CASE = {
  evaluationCriteria: [],
  followupQuestions: [],
  id: "case-1",
  initialPresentation: "presentation",
  modelAnswers: [],
  title: "title text",
};

function baseOptions(
  overrides: Partial<HandleExerciseCaseOptions> = {},
): HandleExerciseCaseOptions {
  return {
    authContext: AUTH_CONTEXT,
    getCaseById: async () => SAMPLE_CASE,
    listCases: async () => [],
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleExerciseCaseRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleExerciseCaseRequest(
      { method: "OPTIONS", path: "/api/exercise-cases" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleExerciseCaseRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleExerciseCaseRequest(
      { method: "GET", path: "/api/exercise-cases" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleExerciseCaseRequest(
      { method: "GET", path: "/api/exercise-cases" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("GET /api/exercise-cases", () => {
    test("query から filters を組み立てて渡す", async () => {
      let capturedFilters: unknown;
      await handleExerciseCaseRequest(
        {
          method: "GET",
          path: "/api/exercise-cases",
          query: { difficultyId: "beginner", specialtyId: "maternal-child" },
        },
        baseOptions({
          listCases: async (filters) => {
            capturedFilters = filters;
            return [SAMPLE_CASE];
          },
        }),
      );

      expect(capturedFilters).toEqual({
        difficultyId: "beginner",
        learningThemeId: undefined,
        specialtyId: "maternal-child",
      });
    });
  });

  describe("GET /api/exercise-cases/:id", () => {
    test("見つかればケースを返す", async () => {
      const response = await handleExerciseCaseRequest(
        { method: "GET", path: "/api/exercise-cases/case-1" },
        baseOptions(),
      );
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).id).toBe("case-1");
    });

    test("見つからなければ 404 を返す", async () => {
      const response = await handleExerciseCaseRequest(
        { method: "GET", path: "/api/exercise-cases/missing" },
        baseOptions({ getCaseById: async () => undefined }),
      );
      expect(response.statusCode).toBe(404);
    });
  });

  test("listCases が例外を投げたら 502 を返す", async () => {
    const response = await handleExerciseCaseRequest(
      { method: "GET", path: "/api/exercise-cases" },
      baseOptions({
        listCases: async () => {
          throw new Error("boom");
        },
      }),
    );
    expect(response.statusCode).toBe(502);
  });
});
