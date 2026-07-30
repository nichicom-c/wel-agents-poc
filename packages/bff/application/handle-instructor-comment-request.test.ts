import { describe, expect, test } from "bun:test";

import {
  type HandleInstructorCommentOptions,
  handleInstructorCommentRequest,
} from "./handle-instructor-comment-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "22222222-2222-2222-2222-222222222222",
};

const SAMPLE_ATTEMPT = {
  answers: {
    additionalConfirmationText: "",
    assessmentText: "",
    soapText: "",
    supportPlanText: "",
  },
  exerciseCase: {
    evaluationCriteria: [],
    followupQuestions: [],
    id: "case-1",
    initialPresentation: "presentation",
    modelAnswers: [],
    title: "title",
  },
  feedback: undefined,
  id: "attempt-1",
  revealedFollowupQuestionIds: [],
  startedAt: "2026-07-20T09:00:00.000Z",
  status: "feedback_ready" as const,
  submittedAt: "2026-07-20T09:10:00.000Z",
  traineeId: "11111111-1111-1111-1111-111111111111",
  traineeName: "trainee",
};

function baseOptions(
  overrides: Partial<HandleInstructorCommentOptions> = {},
): HandleInstructorCommentOptions {
  return {
    authContext: AUTH_CONTEXT,
    postComment: async () => SAMPLE_ATTEMPT,
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleInstructorCommentRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleInstructorCommentRequest(
      { method: "OPTIONS", path: "/api/instructor-comments" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleInstructorCommentRequest(
      { method: "POST", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleInstructorCommentRequest(
      {
        body: JSON.stringify({ body: "x", feedbackId: "feedback-1" }),
        method: "POST",
        path: "/api/instructor-comments",
      },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleInstructorCommentRequest(
      {
        body: JSON.stringify({ body: "x", feedbackId: "feedback-1" }),
        method: "POST",
        path: "/api/instructor-comments",
      },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  test("authContext から instructorId を使ってコメントを投稿する", async () => {
    let capturedInput: unknown;
    const response = await handleInstructorCommentRequest(
      {
        body: JSON.stringify({
          body: "良い視点です。",
          feedbackId: "feedback-1",
        }),
        method: "POST",
        path: "/api/instructor-comments",
      },
      baseOptions({
        postComment: async (input) => {
          capturedInput = input;
          return SAMPLE_ATTEMPT;
        },
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(capturedInput).toEqual({
      body: "良い視点です。",
      feedbackId: "feedback-1",
      instructorDisplayName: AUTH_CONTEXT.displayName,
      instructorId: AUTH_CONTEXT.userId,
    });
  });

  test("feedbackId が無ければ 400 を返す", async () => {
    const response = await handleInstructorCommentRequest(
      {
        body: JSON.stringify({ body: "x" }),
        method: "POST",
        path: "/api/instructor-comments",
      },
      baseOptions(),
    );
    expect(response.statusCode).toBe(400);
  });

  test("body が空なら 400 を返す", async () => {
    const response = await handleInstructorCommentRequest(
      {
        body: JSON.stringify({ body: "  ", feedbackId: "feedback-1" }),
        method: "POST",
        path: "/api/instructor-comments",
      },
      baseOptions(),
    );
    expect(response.statusCode).toBe(400);
  });

  test("postComment が例外を投げたら 502 を返す", async () => {
    const response = await handleInstructorCommentRequest(
      {
        body: JSON.stringify({ body: "x", feedbackId: "feedback-1" }),
        method: "POST",
        path: "/api/instructor-comments",
      },
      baseOptions({
        postComment: async () => {
          throw new Error("boom");
        },
      }),
    );
    expect(response.statusCode).toBe(502);
  });
});
