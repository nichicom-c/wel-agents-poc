import { describe, expect, test } from "bun:test";

import {
  type HandleMaterialOptions,
  handleMaterialRequest,
} from "./handle-material-request.ts";

const AUTH_CONTEXT = {
  actorId: "u-tester",
  displayName: "tester@example.com",
  userId: "11111111-1111-1111-1111-111111111111",
};

const SAMPLE_MATERIAL = {
  createdAt: "2026-07-20T09:00:00.000Z",
  createdBy: AUTH_CONTEXT.userId,
  id: "material-1",
  materialType: "comment_derived_note" as const,
  publicationStatus: "draft" as const,
  revisions: [],
  title: "title text",
};

function baseOptions(
  overrides: Partial<HandleMaterialOptions> = {},
): HandleMaterialOptions {
  return {
    authContext: AUTH_CONTEXT,
    changeStatus: async () => ({
      ...SAMPLE_MATERIAL,
      publicationStatus: "reviewing",
    }),
    createMaterial: async () => SAMPLE_MATERIAL,
    listMaterials: async () => [],
    trainingDataConfigured: true,
    ...overrides,
  };
}

describe("handleMaterialRequest", () => {
  test("OPTIONS は 204 を返す", async () => {
    const response = await handleMaterialRequest(
      { method: "OPTIONS", path: "/api/materials" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(204);
  });

  test("未知の path は 404 を返す", async () => {
    const response = await handleMaterialRequest(
      { method: "GET", path: "/api/other" },
      baseOptions(),
    );
    expect(response.statusCode).toBe(404);
  });

  test("trainingDataConfigured が false なら 503 を返す", async () => {
    const response = await handleMaterialRequest(
      { method: "GET", path: "/api/materials" },
      baseOptions({ trainingDataConfigured: false }),
    );
    expect(response.statusCode).toBe(503);
  });

  test("authContext が無ければ 401 を返す", async () => {
    const response = await handleMaterialRequest(
      { method: "GET", path: "/api/materials" },
      baseOptions({ authContext: undefined }),
    );
    expect(response.statusCode).toBe(401);
  });

  describe("GET /api/materials", () => {
    test("query から filters を組み立てて渡す", async () => {
      let capturedFilters: unknown;
      await handleMaterialRequest(
        {
          method: "GET",
          path: "/api/materials",
          query: {
            materialType: "teaching_case",
            publicationStatus: "published",
          },
        },
        baseOptions({
          listMaterials: async (filters) => {
            capturedFilters = filters;
            return [SAMPLE_MATERIAL];
          },
        }),
      );

      expect(capturedFilters).toEqual({
        materialType: "teaching_case",
        publicationStatus: "published",
      });
    });
  });

  describe("POST /api/materials", () => {
    test("有効な body で教材を作り、authContext から createdBy を使う", async () => {
      let capturedInput: unknown;
      const response = await handleMaterialRequest(
        {
          body: JSON.stringify({
            materialType: "teaching_case",
            title: "title text",
          }),
          method: "POST",
          path: "/api/materials",
        },
        baseOptions({
          createMaterial: async (input) => {
            capturedInput = input;
            return SAMPLE_MATERIAL;
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        createdBy: AUTH_CONTEXT.userId,
        createdByDisplayName: AUTH_CONTEXT.displayName,
        difficultyId: undefined,
        learningThemeId: undefined,
        materialType: "teaching_case",
        specialtyId: undefined,
        title: "title text",
      });
    });

    test("materialType が不正なら 400 を返す", async () => {
      const response = await handleMaterialRequest(
        {
          body: JSON.stringify({ materialType: "x", title: "title" }),
          method: "POST",
          path: "/api/materials",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/materials/:id/status", () => {
    test("有効な body で状態を変更し、authContext から changedBy を使う", async () => {
      let capturedInput: unknown;
      const response = await handleMaterialRequest(
        {
          body: JSON.stringify({ status: "reviewing" }),
          method: "PATCH",
          path: "/api/materials/material-1/status",
        },
        baseOptions({
          changeStatus: async (input) => {
            capturedInput = input;
            return { ...SAMPLE_MATERIAL, publicationStatus: "reviewing" };
          },
        }),
      );

      expect(response.statusCode).toBe(200);
      expect(capturedInput).toEqual({
        changedBy: AUTH_CONTEXT.userId,
        changedByDisplayName: AUTH_CONTEXT.displayName,
        id: "material-1",
        nextStatus: "reviewing",
      });
    });

    test("不正な status は 400 を返す", async () => {
      const response = await handleMaterialRequest(
        {
          body: JSON.stringify({ status: "x" }),
          method: "PATCH",
          path: "/api/materials/material-1/status",
        },
        baseOptions(),
      );
      expect(response.statusCode).toBe(400);
    });

    test("changeStatus が例外を投げたら 502 を返す", async () => {
      const response = await handleMaterialRequest(
        {
          body: JSON.stringify({ status: "reviewing" }),
          method: "PATCH",
          path: "/api/materials/material-1/status",
        },
        baseOptions({
          changeStatus: async () => {
            throw new Error("boom");
          },
        }),
      );
      expect(response.statusCode).toBe(502);
    });
  });
});
