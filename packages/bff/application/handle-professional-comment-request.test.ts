import { describe, expect, test } from "bun:test";

import {
  type HandleProfessionalCommentOptions,
  handleProfessionalCommentRequest,
} from "./handle-professional-comment-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const SAMPLE_COMMENT = {
  authorId: AUTH_CONTEXT.userId,
  authorName: "tester@example.com",
  authorRoleAtPost: "reviewer",
  body: "comment body",
  commentType: "review" as const,
  createdAt: "2026-07-30T00:00:00.000Z",
  id: "comment-1",
  targetRecordId: "record-1",
  targetRecordVersionId: "version-1",
};

function baseOptions(
  overrides: Partial<HandleProfessionalCommentOptions> = {},
): HandleProfessionalCommentOptions {
  return {
    authContext: AUTH_CONTEXT,
    createComment: async () => SAMPLE_COMMENT,
    listCommentsForVersion: async () => [],
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleProfessionalCommentRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleProfessionalCommentRequest(
      { method: "OPTIONS", path: "/api/professional-comments" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleProfessionalCommentRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleProfessionalCommentRequest(
      { method: "GET", path: "/api/professional-comments" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleProfessionalCommentRequest(
      { method: "GET", path: "/api/professional-comments" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("POST /api/professional-comments", () => {
    test("有効な body でコメントを作り、authContext から authorId を使う", async () => {
      let capturedInput: unknown;
      const response = await handleProfessionalCommentRequest(
        {
          body: JSON.stringify({
            authorRoleAtPost: "reviewer",
            body: "comment body",
            commentType: "review",
            soapCategory: "P",
            targetRecordId: "record-1",
            targetRecordVersionId: "version-1",
          }),
          method: "POST",
          path: "/api/professional-comments",
        },
        baseOptions({
          createComment: async (input) => {
            capturedInput = input;
            return SAMPLE_COMMENT;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        authorDisplayName: AUTH_CONTEXT.displayName,
        authorId: AUTH_CONTEXT.userId,
        authorRoleAtPost: "reviewer",
        body: "comment body",
        commentType: "review",
        soapCategory: "P",
        targetRecordId: "record-1",
        targetRecordVersionId: "version-1",
      });
    });

    test("commentType が不正なら 400 を返す", async () => {
      const response = await handleProfessionalCommentRequest(
        {
          body: JSON.stringify({
            authorRoleAtPost: "reviewer",
            body: "comment body",
            commentType: "x",
            targetRecordId: "record-1",
            targetRecordVersionId: "version-1",
          }),
          method: "POST",
          path: "/api/professional-comments",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("body が空なら 400 を返す", async () => {
      const response = await handleProfessionalCommentRequest(
        {
          body: JSON.stringify({
            authorRoleAtPost: "reviewer",
            body: "  ",
            commentType: "review",
            targetRecordId: "record-1",
            targetRecordVersionId: "version-1",
          }),
          method: "POST",
          path: "/api/professional-comments",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("authorRoleAtPost が無ければ 400 を返す", async () => {
      const response = await handleProfessionalCommentRequest(
        {
          body: JSON.stringify({
            body: "comment body",
            commentType: "review",
            targetRecordId: "record-1",
            targetRecordVersionId: "version-1",
          }),
          method: "POST",
          path: "/api/professional-comments",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("createComment が例外を投げたら 502 を返す", async () => {
      const response = await handleProfessionalCommentRequest(
        {
          body: JSON.stringify({
            authorRoleAtPost: "reviewer",
            body: "comment body",
            commentType: "review",
            targetRecordId: "record-1",
            targetRecordVersionId: "version-1",
          }),
          method: "POST",
          path: "/api/professional-comments",
        },
        baseOptions({
          createComment: async () => {
            throw new Error("boom");
          },
        }),
      );
      expect(response.statusCode).toBe(502);
    });
  });

  describe("GET /api/professional-comments", () => {
    test("targetRecordVersionId が無ければ 400 を返す", async () => {
      const response = await handleProfessionalCommentRequest(
        { method: "GET", path: "/api/professional-comments" },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("comments 一覧を返す", async () => {
      let capturedInput: unknown;
      const response = await handleProfessionalCommentRequest(
        {
          method: "GET",
          path: "/api/professional-comments",
          query: { targetRecordVersionId: "version-1" },
        },
        baseOptions({
          listCommentsForVersion: async (input) => {
            capturedInput = input;
            return [SAMPLE_COMMENT];
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({ targetRecordVersionId: "version-1" });
      expect(JSON.parse(response.body).comments).toHaveLength(1);
    });
  });
});
