import { describe, expect, test } from "bun:test";

import {
  MaterialCandidateAlreadyPromotedError,
  MaterialCandidateNotApprovedError,
} from "../contracts/material-candidates.ts";
import {
  type HandleMaterialCandidateOptions,
  handleMaterialCandidateRequest,
} from "./handle-material-candidate-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const SAMPLE_CANDIDATE = {
  comments: [],
  createdAt: "2026-07-30T00:00:00.000Z",
  createdBy: AUTH_CONTEXT.userId,
  id: "candidate-1",
  status: "candidate" as const,
  statusHistory: [],
  summary: "summary text",
  title: "title text",
};

function baseOptions(
  overrides: Partial<HandleMaterialCandidateOptions> = {},
): HandleMaterialCandidateOptions {
  return {
    authContext: AUTH_CONTEXT,
    createCandidate: async () => SAMPLE_CANDIDATE,
    decideStatus: async () => ({ ...SAMPLE_CANDIDATE, status: "approved" }),
    listCandidates: async () => [],
    promoteToMaterial: async () => ({
      ...SAMPLE_CANDIDATE,
      materialId: "material-1",
    }),
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleMaterialCandidateRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleMaterialCandidateRequest(
      { method: "OPTIONS", path: "/api/material-candidates" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleMaterialCandidateRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleMaterialCandidateRequest(
      { method: "GET", path: "/api/material-candidates" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleMaterialCandidateRequest(
      { method: "GET", path: "/api/material-candidates" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("GET /api/material-candidates", () => {
    test("query から filters を組み立てて渡す", async () => {
      let capturedFilters: unknown;
      const response = await handleMaterialCandidateRequest(
        {
          method: "GET",
          path: "/api/material-candidates",
          query: {
            difficultyId: "beginner",
            recordType: "support_activity",
            specialtyId: "maternal-child",
            status: "approved",
          },
        },
        baseOptions({
          listCandidates: async (filters) => {
            capturedFilters = filters;
            return [SAMPLE_CANDIDATE];
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedFilters).toEqual({
        difficultyId: "beginner",
        learningThemeId: undefined,
        recordType: "support_activity",
        specialtyId: "maternal-child",
        status: "approved",
      });
      expect(JSON.parse(response.body).candidates).toHaveLength(1);
    });

    test("不正な recordType / status は無視して未指定として扱う", async () => {
      let capturedFilters: unknown;
      await handleMaterialCandidateRequest(
        {
          method: "GET",
          path: "/api/material-candidates",
          query: { recordType: "x", status: "y" },
        },
        baseOptions({
          listCandidates: async (filters) => {
            capturedFilters = filters;
            return [];
          },
        }),
      );

      expect(capturedFilters).toEqual({
        difficultyId: undefined,
        learningThemeId: undefined,
        recordType: undefined,
        specialtyId: undefined,
        status: undefined,
      });
    });
  });

  describe("POST /api/material-candidates", () => {
    test("有効な body で候補を作り、authContext から createdBy を使う", async () => {
      let capturedInput: unknown;
      const response = await handleMaterialCandidateRequest(
        {
          body: JSON.stringify({
            commentIds: ["comment-1", "comment-2"],
            createdByRole: "reviewer",
            summary: "summary text",
            title: "title text",
          }),
          method: "POST",
          path: "/api/material-candidates",
        },
        baseOptions({
          createCandidate: async (input) => {
            capturedInput = input;
            return SAMPLE_CANDIDATE;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        commentIds: ["comment-1", "comment-2"],
        createdBy: AUTH_CONTEXT.userId,
        createdByDisplayName: AUTH_CONTEXT.displayName,
        createdByRole: "reviewer",
        difficultyId: undefined,
        learningThemeId: undefined,
        recordType: undefined,
        specialtyId: undefined,
        summary: "summary text",
        title: "title text",
      });
    });

    test("commentIds が空なら 400 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          body: JSON.stringify({
            commentIds: [],
            createdByRole: "reviewer",
            summary: "summary text",
            title: "title text",
          }),
          method: "POST",
          path: "/api/material-candidates",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("createdByRole が無ければ 400 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          body: JSON.stringify({
            commentIds: ["comment-1"],
            summary: "summary text",
            title: "title text",
          }),
          method: "POST",
          path: "/api/material-candidates",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/material-candidates/:id/status", () => {
    test("有効な body で状態を決定し、authContext から changedBy を使う", async () => {
      let capturedInput: unknown;
      const response = await handleMaterialCandidateRequest(
        {
          body: JSON.stringify({
            changedByRole: "reviewer",
            status: "approved",
          }),
          method: "PATCH",
          path: "/api/material-candidates/candidate-1/status",
        },
        baseOptions({
          decideStatus: async (input) => {
            capturedInput = input;
            return { ...SAMPLE_CANDIDATE, status: "approved" };
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        changedBy: AUTH_CONTEXT.userId,
        changedByDisplayName: AUTH_CONTEXT.displayName,
        changedByRole: "reviewer",
        id: "candidate-1",
        nextStatus: "approved",
        reasonCode: undefined,
        reasonText: undefined,
      });
    });

    test("status が rejected で reasonCode が無ければ 400 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          body: JSON.stringify({
            changedByRole: "reviewer",
            status: "rejected",
          }),
          method: "PATCH",
          path: "/api/material-candidates/candidate-1/status",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("status が needs_revision で reasonText が無ければ 400 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          body: JSON.stringify({
            changedByRole: "reviewer",
            status: "needs_revision",
          }),
          method: "PATCH",
          path: "/api/material-candidates/candidate-1/status",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("不正な status は 400 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          body: JSON.stringify({ changedByRole: "reviewer", status: "x" }),
          method: "PATCH",
          path: "/api/material-candidates/candidate-1/status",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("decideStatus が例外を投げたら 502 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          body: JSON.stringify({
            changedByRole: "reviewer",
            status: "approved",
          }),
          method: "PATCH",
          path: "/api/material-candidates/candidate-1/status",
        },
        baseOptions({
          decideStatus: async () => {
            throw new Error("boom");
          },
        }),
      );
      expect(response.statusCode).toBe(502);
    });
  });

  describe("POST /api/material-candidates/:id/promote-to-material", () => {
    test("authContext から changedBy を使って教材化する", async () => {
      let capturedInput: unknown;
      const response = await handleMaterialCandidateRequest(
        {
          method: "POST",
          path: "/api/material-candidates/candidate-1/promote-to-material",
        },
        baseOptions({
          promoteToMaterial: async (input) => {
            capturedInput = input;
            return { ...SAMPLE_CANDIDATE, materialId: "material-1" };
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        changedBy: AUTH_CONTEXT.userId,
        changedByDisplayName: AUTH_CONTEXT.displayName,
        id: "candidate-1",
      });
      expect(JSON.parse(response.body).materialId).toBe("material-1");
    });

    test("MaterialCandidateNotApprovedError は 400 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          method: "POST",
          path: "/api/material-candidates/candidate-1/promote-to-material",
        },
        baseOptions({
          promoteToMaterial: async () => {
            throw new MaterialCandidateNotApprovedError("not approved");
          },
        }),
      );
      expect(response.statusCode).toBe(400);
    });

    test("MaterialCandidateAlreadyPromotedError は 400 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          method: "POST",
          path: "/api/material-candidates/candidate-1/promote-to-material",
        },
        baseOptions({
          promoteToMaterial: async () => {
            throw new MaterialCandidateAlreadyPromotedError("already promoted");
          },
        }),
      );
      expect(response.statusCode).toBe(400);
    });

    test("promoteToMaterial が想定外の例外を投げたら 502 を返す", async () => {
      const response = await handleMaterialCandidateRequest(
        {
          method: "POST",
          path: "/api/material-candidates/candidate-1/promote-to-material",
        },
        baseOptions({
          promoteToMaterial: async () => {
            throw new Error("boom");
          },
        }),
      );
      expect(response.statusCode).toBe(502);
    });
  });
});
