import { describe, expect, test } from "bun:test";

import type { RuntimeInvokeResult } from "../contracts/runtime.ts";
import {
  type HandleExerciseAttemptOptions,
  handleExerciseAttemptRequest,
} from "./handle-exercise-attempt-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const EXERCISE_CASE = {
  evaluationCriteria: ["S/O が A を支えているか。"],
  followupQuestions: [],
  id: "case-1",
  initialPresentation: "presentation",
  modelAnswers: [],
  title: "title text",
};

const IN_PROGRESS_ATTEMPT = {
  answers: {
    additionalConfirmationText: "confirm",
    assessmentText: "assessment",
    soapText: "soap",
    supportPlanText: "plan",
  },
  exerciseCase: EXERCISE_CASE,
  feedback: undefined,
  id: "attempt-1",
  revealedFollowupQuestionIds: [],
  startedAt: "2026-07-20T09:00:00.000Z",
  status: "in_progress" as const,
  submittedAt: undefined,
  traineeId: AUTH_CONTEXT.userId,
  traineeName: "trainee",
};

const FEEDBACK_OUTPUT = {
  assessmentNote: "a",
  dataCollectionNote: "b",
  documentationNote: "c",
  rationaleNote: "d",
  supportPlanNote: "e",
};

function okRuntimeResult(payload: unknown): RuntimeInvokeResult {
  return { ok: true, payload, statusCode: 200 };
}

function baseOptions(
  overrides: Partial<HandleExerciseAttemptOptions> = {},
): HandleExerciseAttemptOptions {
  return {
    attachFeedback: async () => ({
      ...IN_PROGRESS_ATTEMPT,
      status: "feedback_ready",
    }),
    authContext: AUTH_CONTEXT,
    getAttemptById: async () => IN_PROGRESS_ATTEMPT,
    invokeRuntime: async () =>
      okRuntimeResult({ status: "success", ...FEEDBACK_OUTPUT }),
    listAttemptsForTrainee: async () => [IN_PROGRESS_ATTEMPT],
    listInstructorQueue: async () => [IN_PROGRESS_ATTEMPT],
    markAttemptSubmitted: async () => ({
      ...IN_PROGRESS_ATTEMPT,
      status: "submitted",
    }),
    revealFollowup: async () => IN_PROGRESS_ATTEMPT,
    saveDraftAnswers: async () => IN_PROGRESS_ATTEMPT,
    startAttempt: async () => IN_PROGRESS_ATTEMPT,
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleExerciseAttemptRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleExerciseAttemptRequest(
      { method: "OPTIONS", path: "/api/exercise-attempts" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleExerciseAttemptRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleExerciseAttemptRequest(
      { method: "GET", path: "/api/exercise-attempts" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleExerciseAttemptRequest(
      { method: "GET", path: "/api/exercise-attempts" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("POST /api/exercise-attempts", () => {
    test("authContext から traineeId を使い演習を開始する", async () => {
      let capturedInput: unknown;
      const response = await handleExerciseAttemptRequest(
        {
          body: JSON.stringify({ exerciseCaseId: "case-1" }),
          method: "POST",
          path: "/api/exercise-attempts",
        },
        baseOptions({
          startAttempt: async (input) => {
            capturedInput = input;
            return IN_PROGRESS_ATTEMPT;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        exerciseCaseId: "case-1",
        traineeDisplayName: AUTH_CONTEXT.displayName,
        traineeId: AUTH_CONTEXT.userId,
      });
    });

    test("exerciseCaseId が無ければ 400 を返す", async () => {
      const response = await handleExerciseAttemptRequest(
        {
          body: JSON.stringify({}),
          method: "POST",
          path: "/api/exercise-attempts",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/exercise-attempts/:id/reveal-followup", () => {
    test("questionId を渡す", async () => {
      let capturedInput: unknown;
      const response = await handleExerciseAttemptRequest(
        {
          body: JSON.stringify({ questionId: "q-1" }),
          method: "PATCH",
          path: "/api/exercise-attempts/attempt-1/reveal-followup",
        },
        baseOptions({
          revealFollowup: async (input) => {
            capturedInput = input;
            return IN_PROGRESS_ATTEMPT;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        attemptId: "attempt-1",
        questionId: "q-1",
      });
    });
  });

  describe("PATCH /api/exercise-attempts/:id/draft-answers", () => {
    test("answers を渡す", async () => {
      let capturedInput: unknown;
      const response = await handleExerciseAttemptRequest(
        {
          body: JSON.stringify({
            answers: {
              additionalConfirmationText: "x",
              assessmentText: "y",
              soapText: "z",
              supportPlanText: "w",
            },
          }),
          method: "PATCH",
          path: "/api/exercise-attempts/attempt-1/draft-answers",
        },
        baseOptions({
          saveDraftAnswers: async (input) => {
            capturedInput = input;
            return IN_PROGRESS_ATTEMPT;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        answers: {
          additionalConfirmationText: "x",
          assessmentText: "y",
          soapText: "z",
          supportPlanText: "w",
        },
        attemptId: "attempt-1",
      });
    });
  });

  describe("POST /api/exercise-attempts/:id/submit", () => {
    test("AgentCore を呼び、5観点をフィードバックとして保存する", async () => {
      let capturedPayload: unknown;
      let capturedFeedback: unknown;
      const response = await handleExerciseAttemptRequest(
        { method: "POST", path: "/api/exercise-attempts/attempt-1/submit" },
        baseOptions({
          attachFeedback: async (input) => {
            capturedFeedback = input;
            return { ...IN_PROGRESS_ATTEMPT, status: "feedback_ready" };
          },
          invokeRuntime: async (_sessionId, payload) => {
            capturedPayload = payload;
            return okRuntimeResult({ status: "success", ...FEEDBACK_OUTPUT });
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedPayload).toMatchObject({
        actor_id: AUTH_CONTEXT.actorId,
        exercise_answers: IN_PROGRESS_ATTEMPT.answers,
        type: "exercise_feedback",
      });
      expect(capturedFeedback).toEqual({
        assessmentNote: "a",
        attemptId: "attempt-1",
        dataCollectionNote: "b",
        documentationNote: "c",
        generatedBy: "ai",
        rationaleNote: "d",
        supportPlanNote: "e",
      });
    });

    test("in_progress でない場合は 400 を返す", async () => {
      const response = await handleExerciseAttemptRequest(
        { method: "POST", path: "/api/exercise-attempts/attempt-1/submit" },
        baseOptions({
          getAttemptById: async () => ({
            ...IN_PROGRESS_ATTEMPT,
            status: "feedback_ready",
          }),
        }),
      );
      expect(response.statusCode).toBe(400);
    });

    test("必須回答が空なら 400 を返す", async () => {
      const response = await handleExerciseAttemptRequest(
        { method: "POST", path: "/api/exercise-attempts/attempt-1/submit" },
        baseOptions({
          getAttemptById: async () => ({
            ...IN_PROGRESS_ATTEMPT,
            answers: { ...IN_PROGRESS_ATTEMPT.answers, soapText: "" },
          }),
        }),
      );
      expect(response.statusCode).toBe(400);
    });

    test("AgentCore invoke 失敗は 502 を返す", async () => {
      const response = await handleExerciseAttemptRequest(
        { method: "POST", path: "/api/exercise-attempts/attempt-1/submit" },
        baseOptions({
          invokeRuntime: async () => ({
            body: "unavailable",
            ok: false,
            statusCode: 500,
          }),
        }),
      );
      expect(response.statusCode).toBe(502);
    });

    test("AgentCore が status: error を返したら 502 を返す", async () => {
      const response = await handleExerciseAttemptRequest(
        { method: "POST", path: "/api/exercise-attempts/attempt-1/submit" },
        baseOptions({
          invokeRuntime: async () =>
            okRuntimeResult({ error: "did not converge", status: "error" }),
        }),
      );
      expect(response.statusCode).toBe(502);
    });
  });

  describe("GET /api/exercise-attempts", () => {
    test("scope=instructor-queue で instructor queue を返す", async () => {
      let calledQueue = false;
      const response = await handleExerciseAttemptRequest(
        {
          method: "GET",
          path: "/api/exercise-attempts",
          query: { scope: "instructor-queue" },
        },
        baseOptions({
          listInstructorQueue: async () => {
            calledQueue = true;
            return [IN_PROGRESS_ATTEMPT];
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(calledQueue).toBe(true);
      expect(JSON.parse(response.body).attempts).toHaveLength(1);
    });

    test("scope 省略時は authContext の trainee 一覧を返す", async () => {
      let capturedTraineeId: unknown;
      await handleExerciseAttemptRequest(
        { method: "GET", path: "/api/exercise-attempts" },
        baseOptions({
          listAttemptsForTrainee: async (traineeId) => {
            capturedTraineeId = traineeId;
            return [IN_PROGRESS_ATTEMPT];
          },
        }),
      );

      expect(capturedTraineeId).toBe(AUTH_CONTEXT.userId);
    });
  });
});
