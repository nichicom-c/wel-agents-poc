import { describe, expect, test } from "bun:test";

import {
  ExerciseCaseAlreadyExistsError,
  ExerciseCaseMaterialNotFoundError,
  ExerciseCaseMaterialTypeError,
} from "../contracts/training.ts";
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
    createCase: async () => SAMPLE_CASE,
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

  describe("POST /api/exercise-cases", () => {
    function postRequest(body: unknown) {
      return {
        body: JSON.stringify(body),
        method: "POST",
        path: "/api/exercise-cases",
      };
    }

    test("materialId と initialPresentation を渡して作る", async () => {
      let captured: unknown;
      const response = await handleExerciseCaseRequest(
        postRequest({
          followupQuestions: [
            { questionText: "q1", revealedInfoText: "info1" },
          ],
          initialPresentation: "presentation",
          materialId: "material-1",
          modelAnswers: [{ answerType: "soap", content: "content" }],
          rubricIds: ["rubric-1"],
        }),
        baseOptions({
          createCase: async (input) => {
            captured = input;
            return SAMPLE_CASE;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(captured).toEqual({
        constraintsText: undefined,
        expectedWorkScene: undefined,
        followupQuestions: [{ questionText: "q1", revealedInfoText: "info1" }],
        initialPresentation: "presentation",
        materialId: "material-1",
        modelAnswers: [
          { acceptableNote: undefined, answerType: "soap", content: "content" },
        ],
        requiredInstitutionalKnowledge: undefined,
        rubricIds: ["rubric-1"],
      });
    });

    test("materialId が無ければ 400 を返す", async () => {
      const response = await handleExerciseCaseRequest(
        postRequest({ initialPresentation: "presentation" }),
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("initialPresentation が無ければ 400 を返す", async () => {
      const response = await handleExerciseCaseRequest(
        postRequest({ materialId: "material-1" }),
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("modelAnswers の answerType が不正なら 400 を返す", async () => {
      const response = await handleExerciseCaseRequest(
        postRequest({
          initialPresentation: "presentation",
          materialId: "material-1",
          modelAnswers: [{ answerType: "invalid", content: "content" }],
        }),
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("ExerciseCaseMaterialNotFoundError を 400 にする", async () => {
      const response = await handleExerciseCaseRequest(
        postRequest({
          initialPresentation: "presentation",
          materialId: "missing",
        }),
        baseOptions({
          createCase: async () => {
            throw new ExerciseCaseMaterialNotFoundError("material not found");
          },
        }),
      );
      expect(response.statusCode).toBe(400);
    });

    test("ExerciseCaseMaterialTypeError を 400 にする", async () => {
      const response = await handleExerciseCaseRequest(
        postRequest({
          initialPresentation: "presentation",
          materialId: "material-1",
        }),
        baseOptions({
          createCase: async () => {
            throw new ExerciseCaseMaterialTypeError("wrong type");
          },
        }),
      );
      expect(response.statusCode).toBe(400);
    });

    test("ExerciseCaseAlreadyExistsError を 400 にする", async () => {
      const response = await handleExerciseCaseRequest(
        postRequest({
          initialPresentation: "presentation",
          materialId: "material-1",
        }),
        baseOptions({
          createCase: async () => {
            throw new ExerciseCaseAlreadyExistsError("already exists");
          },
        }),
      );
      expect(response.statusCode).toBe(400);
    });
  });
});
